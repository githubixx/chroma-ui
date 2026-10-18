// SPDX-License-Identifier: GPL-3.0-or-later

package chromaui

import (
	"bytes"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

func response(handler http.Handler, method, url string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(method, url, nil))
	return recorder
}

func TestHTTPMountAndWholeOverride(t *testing.T) {
	const css = `:root[data-theme="light"] { background: url(assets/panel.svg); }`
	const image = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>`
	files := overrideTheme("light", "Custom Light", css)
	files["light/assets/panel.svg"] = &fstest.MapFile{Data: []byte(image)}
	catalog := newCatalog(t, files)
	mux := http.NewServeMux()
	mux.Handle("/nested/ui/", http.StripPrefix("/nested/ui", catalog.Handler(nil)))
	for _, tt := range []struct {
		file string
		body string
		mime string
	}{
		{"theme.css", css, "text/css"},
		{"assets/panel.svg", image, "image/svg+xml"},
	} {
		got := response(mux, http.MethodGet, "/nested/ui/themes/light/"+tt.file)
		if got.Code != http.StatusOK || got.Body.String() != tt.body {
			t.Fatalf("%s: status %d, body %q", tt.file, got.Code, got.Body.String())
		}
		if !strings.HasPrefix(got.Header().Get("Content-Type"), tt.mime) {
			t.Errorf("wrong MIME type: %v", got.Header())
		}
		if got.Header().Get("Cache-Control") != "no-cache" || got.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Errorf("missing asset headers: %v", got.Header())
		}
	}
	files["light/theme.css"].Data = []byte(":root { color: red; }")
	if got := response(mux, http.MethodGet, "/nested/ui/themes/light/theme.css"); got.Body.String() != ":root { color: red; }" {
		t.Fatal("stylesheet edits require a catalog reload")
	}
	delete(files, "light/theme.css")
	if got := response(mux, http.MethodGet, "/nested/ui/themes/light/theme.css"); got.Code != http.StatusNotFound {
		t.Fatalf("missing override CSS fell back to bundled CSS: %d", got.Code)
	}
}

func TestHTTPConditionalHeadAndRange(t *testing.T) {
	handler := newCatalog(t, nil).Handler(nil)
	const url = "/themes/light/theme.css"
	full := response(handler, http.MethodGet, url)
	if full.Code != http.StatusOK || full.Body.Len() == 0 {
		t.Fatalf("embedded CSS unavailable: %d", full.Code)
	}
	if full.Header().Get("ETag") == "" {
		t.Fatal("missing content ETag")
	}
	request := httptest.NewRequest(http.MethodGet, url, nil)
	request.Header.Set("If-None-Match", full.Header().Get("ETag"))
	cached := httptest.NewRecorder()
	handler.ServeHTTP(cached, request)
	if cached.Code != http.StatusNotModified || cached.Body.Len() != 0 {
		t.Fatalf("conditional response: %d, %q", cached.Code, cached.Body.String())
	}
	head := response(handler, http.MethodHead, url)
	if head.Code != http.StatusOK || head.Body.Len() != 0 || head.Header().Get("Content-Length") != full.Header().Get("Content-Length") {
		t.Fatalf("HEAD response: %d, %v", head.Code, head.Header())
	}
	request = httptest.NewRequest(http.MethodGet, url, nil)
	request.Header.Set("Range", "bytes=0-9")
	partial := httptest.NewRecorder()
	handler.ServeHTTP(partial, request)
	if partial.Code != http.StatusPartialContent || partial.Body.String() != full.Body.String()[:10] {
		t.Fatalf("range response: %d, %q", partial.Code, partial.Body.String())
	}
}

func TestHTTPRejectsNonpublicPaths(t *testing.T) {
	files := overrideTheme("custom", "Custom", ":root {}")
	for _, name := range []string{"private.yaml", ".hidden.png", "image.png/config.json"} {
		files["custom/assets/"+name] = &fstest.MapFile{Data: []byte("not public")}
	}
	files["custom/assets/directory.png"] = &fstest.MapFile{Mode: fs.ModeDir}
	handler := newCatalog(t, files).Handler(nil)
	for _, url := range []string{
		"/", "/themes", "/themes/", "/themes/light/", "/themes/light/theme.yaml",
		"/themes/unknown/theme.css", "/themes/system/theme.css", "/themes/LIGHT/theme.css",
		"/themes/light/theme.css/", "/themes/light/assets/",
		"/themes/custom/assets/private.yaml", "/themes/custom/assets/.hidden.png",
		"/themes/custom/assets/image.png/config.json", "/themes/custom/assets/directory.png",
		"/themes/custom/assets/../../theme.yaml", "/themes/custom/assets/%2e%2e/theme.yaml",
		"/themes/custom/assets/..%2f..%2ftheme.yaml", "/themes/custom/assets/.private/image.png",
		"/themes/custom/assets/foo%5cimage.png", "/themes/custom//theme.css",
		"/themes/custom/assets/null%00.png",
	} {
		t.Run(url, func(t *testing.T) {
			if got := response(handler, http.MethodGet, url); got.Code != http.StatusNotFound {
				t.Fatalf("nonpublic path returned %d, body %q", got.Code, got.Body.String())
			}
		})
	}
	if got := response(handler, http.MethodPost, "/themes/light/theme.css"); got.Code != http.StatusMethodNotAllowed || got.Header().Get("Allow") != "GET, HEAD" {
		t.Fatalf("write method accepted: %d, %v", got.Code, got.Header())
	}
}

func TestHTTPAssetContentTypes(t *testing.T) {
	types := map[string]string{
		".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
		".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif",
		".svg": "image/svg+xml", ".ico": "image/vnd.microsoft.icon",
		".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
	}
	files := overrideTheme("custom", "Custom", ":root {}")
	for ext := range types {
		files["custom/assets/public"+ext] = &fstest.MapFile{Data: []byte("fixture")}
	}
	handler := newCatalog(t, files).Handler(nil)
	for ext, contentType := range types {
		got := response(handler, http.MethodGet, "/themes/custom/assets/public"+ext)
		if got.Code != http.StatusOK || got.Header().Get("Content-Type") != contentType {
			t.Errorf("%s: status %d, headers %v", ext, got.Code, got.Header())
		}
	}
}

func TestHTTPUsesReloadedCatalog(t *testing.T) {
	files := overrideTheme("custom", "Custom", ":root {}")
	catalog := newCatalog(t, files)
	handler := catalog.Handler(nil)
	const url = "/themes/added/theme.css"
	if got := response(handler, http.MethodGet, url); got.Code != http.StatusNotFound {
		t.Fatal("undiscovered theme was served")
	}
	for name, file := range overrideTheme("added", "Added", ":root { color: red; }") {
		files[name] = file
	}
	if err := catalog.Reload(); err != nil {
		t.Fatal(err)
	}
	if got := response(handler, http.MethodGet, url); got.Code != http.StatusOK || got.Body.String() != ":root { color: red; }" {
		t.Fatalf("existing handler did not see newly published catalog: %d, %q", got.Code, got.Body.String())
	}
	files["added/theme.yaml"].Data = []byte("name: [invalid]\n")
	if err := catalog.Reload(); err == nil {
		t.Fatal("invalid reload accepted")
	}
	if got := response(handler, http.MethodGet, url); got.Code != http.StatusOK {
		t.Fatalf("failed reload discarded previous source selection: %d", got.Code)
	}
	delete(files, "added/theme.yaml")
	delete(files, "added/theme.css")
	if err := catalog.Reload(); err != nil {
		t.Fatal(err)
	}
	if got := response(handler, http.MethodGet, url); got.Code != http.StatusNotFound {
		t.Fatal("removed theme still served")
	}
}

func TestHTTPCoreAssets(t *testing.T) {
	handler := newCatalog(t, nil).Handler(nil)
	for _, asset := range []struct {
		path string
		mime string
	}{
		{"/css/base.css", "text/css; charset=utf-8"},
		{"/js/theme.js", "text/javascript; charset=utf-8"},
		{"/js/menu.js", "text/javascript; charset=utf-8"},
		{"/js/select.js", "text/javascript; charset=utf-8"},
	} {
		got := response(handler, http.MethodGet, asset.path)
		if got.Code != http.StatusOK || got.Body.Len() == 0 || got.Header().Get("Content-Type") != asset.mime {
			t.Errorf("%s: %d, %v", asset.path, got.Code, got.Header())
		}
		request := httptest.NewRequest(http.MethodGet, asset.path, nil)
		request.Header.Set("If-None-Match", got.Header().Get("ETag"))
		cached := httptest.NewRecorder()
		handler.ServeHTTP(cached, request)
		if cached.Code != http.StatusNotModified {
			t.Errorf("%s did not revalidate: %d", asset.path, cached.Code)
		}
	}
	for _, path := range []string{"/css/", "/js/", "/templates/header.html", "/assets/js/menu.js", "/js/../templates/header.html", "/js/unknown.js"} {
		if got := response(handler, http.MethodGet, path); got.Code != http.StatusNotFound {
			t.Errorf("private/nonexistent core path %q exposed: %d", path, got.Code)
		}
	}
}

func TestHTTPLogsUnexpectedIOErrors(t *testing.T) {
	files := &faultFS{FS: overrideTheme("light", "Custom", ":root {}")}
	catalog := newCatalog(t, files)
	files.fail = true
	var logs bytes.Buffer
	handler := catalog.Handler(slog.New(slog.NewJSONHandler(&logs, nil)))
	got := response(handler, http.MethodGet, "/themes/light/theme.css")
	if got.Code != http.StatusInternalServerError || got.Body.String() != "Internal Server Error\n" {
		t.Fatalf("I/O failure hidden or disclosed: %d, %q", got.Code, got.Body.String())
	}
	for _, field := range []string{`"theme":"light"`, `"asset":"theme.css"`, `"error":`} {
		if !strings.Contains(logs.String(), field) {
			t.Fatalf("missing error context %s: %s", field, &logs)
		}
	}
}

type faultFS struct {
	fs.FS
	fail bool
}

func (f *faultFS) Open(name string) (fs.File, error) {
	if f.fail {
		return nil, &fs.PathError{Op: "open", Path: name, Err: errors.New("injected read failure")}
	}
	return f.FS.Open(name)
}

func TestHTTPRejectsSymlinkAssets(t *testing.T) {
	for _, target := range []string{"file", "directory"} {
		t.Run(target, func(t *testing.T) {
			dir := t.TempDir()
			if err := os.MkdirAll(filepath.Join(dir, "custom", "assets"), 0700); err != nil {
				t.Fatal(err)
			}
			for name, file := range overrideTheme("custom", "Custom", ":root {}") {
				if err := os.WriteFile(filepath.Join(dir, filepath.FromSlash(name)), file.Data, 0600); err != nil {
					t.Fatal(err)
				}
			}
			if err := os.WriteFile(filepath.Join(dir, "custom", "assets", "private.png"), []byte("private"), 0600); err != nil {
				t.Fatal(err)
			}
			url := "/themes/custom/assets/link.png"
			if target == "file" {
				if err := os.Symlink("private.png", filepath.Join(dir, "custom", "assets", "link.png")); err != nil {
					t.Fatal(err)
				}
			} else {
				if err := os.Symlink("assets", filepath.Join(dir, "custom", "linked")); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink("../linked", filepath.Join(dir, "custom", "assets", "nested")); err != nil {
					t.Fatal(err)
				}
				url = "/themes/custom/assets/nested/private.png"
			}
			root, err := os.OpenRoot(dir)
			if err != nil {
				t.Fatal(err)
			}
			defer root.Close()
			var logs bytes.Buffer
			handler := newCatalog(t, root.FS()).Handler(slog.New(slog.NewTextHandler(&logs, nil)))
			got := response(handler, http.MethodGet, url)
			if got.Code != http.StatusInternalServerError || strings.Contains(got.Body.String(), "private") || logs.Len() == 0 {
				t.Fatalf("link not rejected explicitly: %d, %q, log=%s", got.Code, got.Body.String(), &logs)
			}
		})
	}
}
