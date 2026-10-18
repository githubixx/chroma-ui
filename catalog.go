// SPDX-License-Identifier: GPL-3.0-or-later

// Package chromaui provides reusable themes for server-rendered applications.
package chromaui

import (
	"bytes"
	"embed"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"path"
	"regexp"
	"sort"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

//go:embed assets templates
var assets embed.FS

var themeID = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Theme is copy-safe metadata. ID and Bundled are assigned by the catalog, not YAML.
type Theme struct {
	ID          string `yaml:"-"`
	Bundled     bool   `yaml:"-"`
	Name        string `yaml:"name"`
	Author      string `yaml:"author"`
	Description string `yaml:"description"`
	Version     string `yaml:"version"`
}

// ThemeError identifies the source, theme, and file that prevented discovery.
type ThemeError struct {
	Source string
	ID     string
	File   string
	Err    error
}

func (e *ThemeError) Error() string {
	return fmt.Sprintf("chroma-ui: %s theme %q (%s): %v", e.Source, e.ID, e.File, e.Err)
}

func (e *ThemeError) Unwrap() error { return e.Err }

type themeEntry struct {
	theme Theme
	files fs.FS
}

// Catalog merges bundled themes with optional whole-theme overrides.
// Source filesystems must support concurrent reads and remain open while used.
type Catalog struct {
	reloadMu  sync.Mutex
	mu        sync.RWMutex
	overrides fs.FS
	entries   map[string]themeEntry
}

// NewCatalog loads bundled themes and optional overrides rooted at directories
// containing <id>/theme.yaml and <id>/theme.css. Pass nil for bundled themes only.
// An invalid override is an error, never a fallback to the bundled theme.
func NewCatalog(overrides fs.FS) (*Catalog, error) {
	c := &Catalog{overrides: overrides}
	if err := c.Reload(); err != nil {
		return nil, err
	}
	return c, nil
}

// Themes returns display metadata sorted by ID. Callers may modify the result.
func (c *Catalog) Themes() []Theme {
	c.mu.RLock()
	themes := make([]Theme, 0, len(c.entries))
	for _, entry := range c.entries {
		themes = append(themes, entry.theme)
	}
	c.mu.RUnlock()
	sort.Slice(themes, func(i, j int) bool { return themes[i].ID < themes[j].ID })
	return themes
}

// Theme looks up an exact ID. "system" is an application mode, not a theme ID.
func (c *Catalog) Theme(id string) (Theme, bool) {
	entry, ok := c.entry(id)
	return entry.theme, ok
}

func (c *Catalog) entry(id string) (themeEntry, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	entry, ok := c.entries[id]
	return entry, ok
}

// Reload publishes a new catalog only after every source validates.
// A failure preserves the previous metadata and source selection. Asset bytes
// remain live in their source filesystem, so CSS edits need no catalog reload.
func (c *Catalog) Reload() error {
	c.reloadMu.Lock()
	defer c.reloadMu.Unlock()

	bundled, err := fs.Sub(assets, "assets/themes")
	if err != nil {
		return fmt.Errorf("chroma-ui: open bundled themes: %w", err)
	}
	entries, err := discover(bundled, "bundled")
	if err != nil {
		return err
	}
	if c.overrides != nil {
		overrides, err := discover(c.overrides, "override")
		if err != nil {
			return err
		}
		for id, entry := range overrides {
			entries[id] = entry
		}
	}
	c.mu.Lock()
	c.entries = entries
	c.mu.Unlock()
	return nil
}

func discover(source fs.FS, label string) (map[string]themeEntry, error) {
	dirs, err := fs.ReadDir(source, ".")
	if err != nil {
		return nil, fmt.Errorf("chroma-ui: read %s theme directory: %w", label, err)
	}
	entries := make(map[string]themeEntry)
	for _, dir := range dirs {
		id := dir.Name()
		fail := func(file string, err error) error {
			return &ThemeError{Source: label, ID: id, File: file, Err: err}
		}
		if dir.Type()&fs.ModeSymlink != 0 {
			return nil, fail(".", errors.New("theme directories must not be symbolic links"))
		}
		if !dir.IsDir() {
			continue
		}
		if !themeID.MatchString(id) || id == "system" {
			return nil, fail(".", errors.New("ID must be lowercase alphanumeric words separated by hyphens; system is reserved"))
		}
		files, err := fs.Sub(source, id)
		if err != nil {
			return nil, fail(".", err)
		}
		data, _, err := readRegularFile(files, "theme.yaml")
		if err != nil {
			return nil, fail("theme.yaml", err)
		}
		var theme Theme
		decoder := yaml.NewDecoder(bytes.NewReader(data))
		decoder.KnownFields(true)
		if err := decoder.Decode(&theme); err != nil {
			return nil, fail("theme.yaml", err)
		}
		var extra any
		if err := decoder.Decode(&extra); err != io.EOF {
			if err == nil {
				err = errors.New("expected a single YAML document")
			}
			return nil, fail("theme.yaml", err)
		}
		if strings.TrimSpace(theme.Name) == "" {
			return nil, fail("theme.yaml", errors.New("name is required"))
		}
		css, _, err := readRegularFile(files, "theme.css")
		if err != nil {
			return nil, fail("theme.css", err)
		}
		if len(bytes.TrimSpace(css)) == 0 {
			return nil, fail("theme.css", errors.New("stylesheet is empty"))
		}
		theme.ID = id
		theme.Bundled = label == "bundled"
		entries[id] = themeEntry{theme: theme, files: files}
	}
	return entries, nil
}

func readRegularFile(files fs.FS, name string) ([]byte, fs.FileInfo, error) {
	parts := strings.Split(name, "/")
	for i := range parts {
		info, err := fs.Lstat(files, path.Join(parts[:i+1]...))
		if err != nil {
			return nil, nil, err
		}
		if info.Mode()&fs.ModeSymlink != 0 {
			return nil, nil, &fs.PathError{Op: "open", Path: name, Err: fs.ErrPermission}
		}
	}
	file, err := files.Open(name)
	if err != nil {
		return nil, nil, err
	}
	info, err := file.Stat()
	if err != nil {
		return nil, nil, errors.Join(err, file.Close())
	}
	if !info.Mode().IsRegular() {
		return nil, nil, errors.Join(fs.ErrNotExist, file.Close())
	}
	data, err := io.ReadAll(file)
	if err := errors.Join(err, file.Close()); err != nil {
		return nil, nil, err
	}
	return data, info, nil
}
