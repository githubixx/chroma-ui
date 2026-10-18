// SPDX-License-Identifier: GPL-3.0-or-later

package chromaui

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
	"testing/fstest"
)

var bundledIDs = []string{
	"aurora-glass-1", "cartoon-1", "crt-starfield-1", "dark", "fitness",
	"glas-1", "gold-1", "golden-moon", "light", "lighting-1", "luxury-1",
	"mantle-1", "metal-1", "retro-arcade", "solar-system-1", "space-night-1",
	"spaceship-2", "spaceship-blue-dark", "spaceship-blue-light",
	"spaceship-cyan-dark", "spaceship-cyan-light", "spaceship-green-dark",
	"spaceship-green-light", "spaceship-grey-dark", "spaceship-grey-light",
	"spaceship-magenta-dark", "spaceship-magenta-light", "spaceship-mono-dark",
	"spaceship-mono-light", "spaceship-orange-dark", "spaceship-orange-light",
	"spaceship-purple-dark", "spaceship-purple-light", "spaceship-red-dark",
	"spaceship-red-light", "spaceship-yellow-dark", "spaceship-yellow-light",
}

func overrideTheme(id, name, css string) fstest.MapFS {
	return fstest.MapFS{
		id + "/theme.yaml": {Data: []byte("name: " + name + "\nauthor: Example\nversion: 2.0.0\n")},
		id + "/theme.css":  {Data: []byte(css)},
	}
}

func newCatalog(t *testing.T, overrides fs.FS) *Catalog {
	t.Helper()
	catalog, err := NewCatalog(overrides)
	if err != nil {
		t.Fatal(err)
	}
	return catalog
}

func TestBundledThemes(t *testing.T) {
	catalog := newCatalog(t, nil)
	themes := catalog.Themes()
	var ids []string
	for _, theme := range themes {
		ids = append(ids, theme.ID)
		if !theme.Bundled || theme.Author != "vdradmin-go" || theme.Name == "" || theme.Version != "1.0.0" {
			t.Errorf("metadata not preserved: %+v", theme)
		}
	}
	if !reflect.DeepEqual(ids, bundledIDs) {
		t.Fatalf("unexpected bundled IDs: %v", ids)
	}
	for _, id := range []string{"system", "LIGHT", "unknown", "../light"} {
		if _, ok := catalog.Theme(id); ok {
			t.Errorf("unexpected theme %q", id)
		}
	}
	original := themes[0]
	themes[0].Name = "changed"
	theme, ok := catalog.Theme(original.ID)
	if !ok || theme.Name != original.Name {
		t.Fatalf("caller modified catalog through list: %+v", theme)
	}
	theme.Name = "also changed"
	if got, _ := catalog.Theme(original.ID); got.Name != original.Name {
		t.Fatal("caller modified catalog through lookup")
	}
}

func TestOverridesAndReload(t *testing.T) {
	files := overrideTheme("light", "Custom Light", ":root { --primary-color: blue; }")
	catalog := newCatalog(t, files)
	if theme, _ := catalog.Theme("light"); theme.Bundled || theme.Name != "Custom Light" || theme.Author != "Example" {
		t.Fatalf("override not selected: %+v", theme)
	}
	if _, ok := catalog.Theme("dark"); !ok {
		t.Fatal("unrelated bundled theme disappeared")
	}

	files["light/theme.yaml"].Data = []byte("name: Updated Light\n")
	files["custom/theme.yaml"] = &fstest.MapFile{Data: []byte("name: Custom\n")}
	files["custom/theme.css"] = &fstest.MapFile{Data: []byte(":root { color-scheme: dark; }")}
	if err := catalog.Reload(); err != nil {
		t.Fatal(err)
	}
	if theme, _ := catalog.Theme("light"); theme.Name != "Updated Light" {
		t.Fatalf("metadata not reloaded: %+v", theme)
	}
	if _, ok := catalog.Theme("custom"); !ok {
		t.Fatal("new theme not discovered")
	}

	before := catalog.Themes()
	files["light/theme.yaml"].Data = []byte("name: [invalid scalar]\n")
	if err := catalog.Reload(); err == nil {
		t.Fatal("invalid reload succeeded")
	}
	if !reflect.DeepEqual(catalog.Themes(), before) {
		t.Fatal("failed reload changed published metadata")
	}
	delete(files, "light/theme.yaml")
	delete(files, "light/theme.css")
	delete(files, "custom/theme.yaml")
	delete(files, "custom/theme.css")
	if err := catalog.Reload(); err != nil {
		t.Fatal(err)
	}
	if theme, _ := catalog.Theme("light"); !theme.Bundled || theme.Name != "Light" {
		t.Fatalf("removing override did not restore bundled theme: %+v", theme)
	}
	if _, ok := catalog.Theme("custom"); ok {
		t.Fatal("removed custom theme retained")
	}
}

func TestInvalidOverridesFailExplicitly(t *testing.T) {
	tests := []struct {
		name   string
		id     string
		mutate func(fstest.MapFS)
		file   string
	}{
		{"missing metadata", "light", func(files fstest.MapFS) { delete(files, "light/theme.yaml") }, "theme.yaml"},
		{"invalid YAML", "light", func(files fstest.MapFS) { files["light/theme.yaml"].Data = []byte("name: [") }, "theme.yaml"},
		{"empty name", "light", func(files fstest.MapFS) { files["light/theme.yaml"].Data = []byte("name: ' '\n") }, "theme.yaml"},
		{"unknown field", "light", func(files fstest.MapFS) { files["light/theme.yaml"].Data = []byte("name: Light\nextra: ignored\n") }, "theme.yaml"},
		{"spoofed source", "light", func(files fstest.MapFS) { files["light/theme.yaml"].Data = []byte("name: Light\nbundled: true\n") }, "theme.yaml"},
		{"duplicate field", "light", func(files fstest.MapFS) { files["light/theme.yaml"].Data = []byte("name: One\nname: Two\n") }, "theme.yaml"},
		{"multiple documents", "light", func(files fstest.MapFS) { files["light/theme.yaml"].Data = []byte("name: One\n---\nname: Two\n") }, "theme.yaml"},
		{"missing CSS", "light", func(files fstest.MapFS) { delete(files, "light/theme.css") }, "theme.css"},
		{"empty CSS", "light", func(files fstest.MapFS) { files["light/theme.css"].Data = []byte(" \n") }, "theme.css"},
		{"CSS is directory", "light", func(files fstest.MapFS) { files["light/theme.css"].Mode = fs.ModeDir }, "theme.css"},
		{"reserved ID", "system", nil, "."},
		{"invalid ID", "Bad_ID", nil, "."},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			files := overrideTheme(tt.id, "Example", ":root {}")
			if tt.mutate != nil {
				tt.mutate(files)
			}
			catalog, err := NewCatalog(files)
			if err == nil || catalog != nil {
				t.Fatal("invalid override silently accepted")
			}
			var themeErr *ThemeError
			if !errors.As(err, &themeErr) || themeErr.Source != "override" || themeErr.ID != tt.id || themeErr.File != tt.file {
				t.Fatalf("missing actionable theme error: %v", err)
			}
		})
	}
}

func TestUnreadableOverrideRoot(t *testing.T) {
	_, err := NewCatalog(failingFS{err: fs.ErrPermission})
	if !errors.Is(err, fs.ErrPermission) {
		t.Fatalf("expected directory permission error, got %v", err)
	}
	_, err = NewCatalog(failingFS{err: fs.ErrNotExist})
	if !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("explicit missing filesystem must not be silently ignored: %v", err)
	}
	if got := newCatalog(t, fstest.MapFS{}).Themes(); len(got) != len(bundledIDs) {
		t.Fatalf("empty, readable override root failed: %v", got)
	}
}

type failingFS struct{ err error }

func (f failingFS) Open(name string) (fs.File, error) {
	return nil, &fs.PathError{Op: "open", Path: name, Err: f.err}
}

func TestConcurrentCatalogReadsAndReload(t *testing.T) {
	catalog := newCatalog(t, overrideTheme("custom", "Custom", ":root {}"))
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range 100 {
				if theme, ok := catalog.Theme("custom"); !ok || theme.Name != "Custom" {
					t.Errorf("incomplete published catalog: %+v, %v", theme, ok)
					return
				}
				if len(catalog.Themes()) != len(bundledIDs)+1 {
					t.Error("incomplete theme list")
					return
				}
			}
		}()
	}
	for range 20 {
		if err := catalog.Reload(); err != nil {
			t.Fatal(err)
		}
	}
	wg.Wait()
}

func TestDirectorySourceRejectsSymlinkThemesAndMetadata(t *testing.T) {
	for _, target := range []string{"directory", "metadata", "stylesheet"} {
		t.Run(target, func(t *testing.T) {
			dir := t.TempDir()
			files := overrideTheme("custom", "Custom", ":root {}")
			for name, file := range files {
				dest := filepath.Join(dir, filepath.FromSlash(name))
				if err := os.MkdirAll(filepath.Dir(dest), 0700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(dest, file.Data, 0600); err != nil {
					t.Fatal(err)
				}
			}
			switch target {
			case "directory":
				if err := os.Symlink("custom", filepath.Join(dir, "alias")); err != nil {
					t.Fatal(err)
				}
			default:
				name := "theme.yaml"
				if target == "stylesheet" {
					name = "theme.css"
				}
				original := filepath.Join(dir, "custom", name)
				if err := os.Rename(original, original+".original"); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(name+".original", original); err != nil {
					t.Fatal(err)
				}
			}
			root, err := os.OpenRoot(dir)
			if err != nil {
				t.Fatal(err)
			}
			defer root.Close()
			if _, err := NewCatalog(root.FS()); err == nil {
				t.Fatal("symbolic link accepted")
			}
		})
	}
}
