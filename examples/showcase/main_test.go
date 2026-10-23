// SPDX-License-Identifier: GPL-3.0-or-later

package main

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestShowcaseVariantsAndMount(t *testing.T) {
	handler, err := newHandler("/nested/skin", slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	for _, tt := range []struct {
		url       string
		brand     string
		action    string
		section   string
		forbidden string
	}{
		{"/?app=memory&theme=light", "Memory Desk", "Create memory", "Memories", "Create mailbox"},
		{"/?app=mail&theme=dark&section=Domains", "Mail Console", "Create mailbox", "Domains", "Create memory"},
	} {
		body := httptest.NewRecorder()
		handler.ServeHTTP(body, httptest.NewRequest(http.MethodGet, tt.url, nil))
		if body.Code != http.StatusOK {
			t.Fatalf("%s: %d: %s", tt.url, body.Code, body.Body.String())
		}
		for _, want := range []string{
			tt.brand, tt.action, tt.section, `href="/nested/skin/css/base.css"`,
			`src="/nested/skin/js/menu.js"`, `src="/nested/skin/js/select.js"`,
			`class="nav-item-icon"`, `class="demo-svg"`,
			`class="ui-pager toolbar"`, `aria-label="` + tt.brand + ` first page"`,
			`role="status" aria-live="polite" aria-atomic="true">` + tt.section + ` 1–4 of 12`,
		} {
			if !strings.Contains(body.Body.String(), want) {
				t.Errorf("%s: missing %q", tt.url, want)
			}
		}
		if strings.Contains(body.Body.String(), tt.forbidden) {
			t.Errorf("%s contains other application's action", tt.url)
		}
	}
	for _, asset := range []string{"/css/base.css", "/themes/light/theme.css", "/js/theme.js", "/js/menu.js", "/js/select.js"} {
		body := httptest.NewRecorder()
		handler.ServeHTTP(body, httptest.NewRequest(http.MethodGet, "/nested/skin"+asset, nil))
		if body.Code != http.StatusOK {
			t.Errorf("nested asset %s: %d", asset, body.Code)
		}
	}
	body := httptest.NewRecorder()
	handler.ServeHTTP(body, httptest.NewRequest(http.MethodGet, "/?enhance=0", nil))
	if body.Code != http.StatusOK || strings.Contains(body.Body.String(), `/js/select.js`) {
		t.Fatal("native-control mode loads the enhancement")
	}
}

func TestShowcaseRejectsInvalidInputs(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	for _, prefix := range []string{"", "/", "ui", "/ui/", "/../ui", "//ui", "/ui?x", "/ui#x", "/ui%20x", "/{ui}", "/ui x", "/ui\nx"} {
		if _, err := newHandler(prefix, logger); err == nil {
			t.Errorf("invalid prefix %q accepted", prefix)
		}
	}
	handler, err := newHandler("/ui", logger)
	if err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{"app=unknown", "theme=unknown", "section=unknown", "app=mail&section=Memories", "enhance=maybe"} {
		body := httptest.NewRecorder()
		handler.ServeHTTP(body, httptest.NewRequest(http.MethodGet, "/?"+query, nil))
		if body.Code != http.StatusBadRequest {
			t.Errorf("%s: invalid input returned %d", query, body.Code)
		}
	}
}

func TestShowcaseDoesNotNeedSourceDirectory(t *testing.T) {
	t.Chdir(t.TempDir())
	handler, err := newHandler("/ui", nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, url := range []string{"/", "/ui/css/base.css", "/ui/js/menu.js", "/ui/themes/light/theme.css"} {
		body := httptest.NewRecorder()
		handler.ServeHTTP(body, httptest.NewRequest(http.MethodGet, url, nil))
		if body.Code != http.StatusOK || body.Body.Len() == 0 {
			t.Errorf("embedded resource %s unavailable outside source tree: %d", url, body.Code)
		}
	}
}
