// SPDX-License-Identifier: GPL-3.0-or-later

package chromaui

import (
	"bytes"
	"crypto/sha256"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"path"
	"strings"
)

var coreAssetTypes = map[string]string{
	"/css/base.css": "text/css; charset=utf-8",
	"/js/theme.js":  "text/javascript; charset=utf-8",
	"/js/menu.js":   "text/javascript; charset=utf-8",
	"/js/select.js": "text/javascript; charset=utf-8",
}

// Handler serves shared CSS/JavaScript, /themes/<id>/theme.css, and public
// image/font files beneath /themes/<id>/assets/.
// Mount it with http.StripPrefix for a custom URL prefix.
// It deliberately exposes neither metadata nor directory listings.
// Unexpected filesystem failures are logged using logger (or slog.Default).
func (c *Catalog) Handler(logger *slog.Logger) http.Handler {
	if logger == nil {
		logger = slog.Default()
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
			return
		}
		var files fs.FS = assets
		id, file := "", "assets"+r.URL.Path
		contentType, shared := coreAssetTypes[r.URL.Path]
		if !shared {
			name, ok := strings.CutPrefix(r.URL.Path, "/themes/")
			if !ok || !fs.ValidPath(name) || strings.ContainsAny(name, "\\\x00") {
				http.NotFound(w, r)
				return
			}
			id, file, ok = strings.Cut(name, "/")
			contentType = publicThemeType(file)
			if !ok || !themeID.MatchString(id) || contentType == "" {
				http.NotFound(w, r)
				return
			}
			entry, ok := c.entry(id)
			if !ok {
				http.NotFound(w, r)
				return
			}
			files = entry.files
		}
		data, info, err := readRegularFile(files, file)
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				http.NotFound(w, r)
				return
			}
			logger.Error("chroma-ui: read theme asset", "theme", id, "asset", file, "error", err)
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("ETag", fmt.Sprintf(`"%x"`, sha256.Sum256(data)))
		http.ServeContent(w, r, path.Base(file), info.ModTime(), bytes.NewReader(data))
	})
}

func publicThemeType(name string) string {
	if name == "theme.css" {
		return "text/css; charset=utf-8"
	}
	if !strings.HasPrefix(name, "assets/") {
		return ""
	}
	for _, segment := range strings.Split(name, "/") {
		if strings.HasPrefix(segment, ".") {
			return ""
		}
	}
	switch path.Ext(name) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".avif":
		return "image/avif"
	case ".svg":
		return "image/svg+xml"
	case ".ico":
		return "image/vnd.microsoft.icon"
	case ".woff":
		return "font/woff"
	case ".woff2":
		return "font/woff2"
	case ".ttf":
		return "font/ttf"
	case ".otf":
		return "font/otf"
	default:
		return ""
	}
}
