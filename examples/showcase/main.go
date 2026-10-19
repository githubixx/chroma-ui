// SPDX-License-Identifier: GPL-3.0-or-later

package main

import (
	"bytes"
	"context"
	"embed"
	"errors"
	"flag"
	"fmt"
	"html/template"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path"
	"strings"
	"syscall"
	"time"

	"github.com/githubixx/chroma-ui"
)

//go:embed showcase.html
var pages embed.FS

type demoApp struct {
	ID, Brand, Badge, Action, Symbol string
	Sections                         []string
}

var demoApps = map[string]demoApp{
	"memory": {
		ID: "memory", Brand: "Memory Desk", Badge: "Curator",
		Action: "Create memory", Symbol: "+",
		Sections: []string{"Memories", "Albums", "Settings"},
	},
	"mail": {
		ID: "mail", Brand: "Mail Console", Badge: "Operator",
		Action: "Create mailbox", Symbol: "@",
		Sections: []string{"Mailboxes", "Domains", "Queue"},
	},
}

type pageData struct {
	Header     chromaui.Header
	App        demoApp
	Prefix     string
	Theme      string
	Section    string
	Enhanced   bool
	Themes     []chromaui.Theme
	MemoryHref string
	MailHref   string
	ToggleHref string
}

func main() {
	addr := flag.String("addr", "127.0.0.1:18764", "HTTP listen address")
	prefix := flag.String("assets-prefix", "/ui", "absolute, non-root shared asset URL prefix")
	flag.Parse()
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if err := run(*addr, *prefix, logger); err != nil {
		logger.Error("showcase failed", "error", err)
		os.Exit(1)
	}
}

func run(addr, prefix string, logger *slog.Logger) error {
	handler, err := newHandler(prefix, logger)
	if err != nil {
		return err
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	server := &http.Server{
		Handler: handler, ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second,
	}
	signals, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	logger.Info("showcase ready", "url", "http://"+listener.Addr().String(), "assetsPrefix", prefix)
	select {
	case err := <-done:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-signals.Done():
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			return errors.Join(err, server.Close())
		}
		return nil
	}
}

func newHandler(prefix string, logger *slog.Logger) (http.Handler, error) {
	if !strings.HasPrefix(prefix, "/") || prefix == "/" || path.Clean(prefix) != prefix ||
		strings.ContainsAny(prefix, "\\?#%{}\x00\r\n\t ") {
		return nil, fmt.Errorf("invalid assets prefix %q: use an absolute non-root URL path without a trailing slash", prefix)
	}
	if logger == nil {
		logger = slog.Default()
	}
	catalog, err := chromaui.NewCatalog(nil)
	if err != nil {
		return nil, err
	}
	templates, err := chromaui.ParseTemplates(template.New("showcase"))
	if err != nil {
		return nil, err
	}
	templates, err = templates.ParseFS(pages, "showcase.html")
	if err != nil {
		return nil, fmt.Errorf("parse showcase: %w", err)
	}
	mux := http.NewServeMux()
	mux.Handle(prefix+"/", http.StripPrefix(prefix, catalog.Handler(logger)))
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		data, err := dataFor(r.URL.Query(), prefix, catalog)
		if err != nil {
			logger.Warn("invalid showcase query", "error", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		var body bytes.Buffer
		if err := templates.ExecuteTemplate(&body, "showcase.html", data); err != nil {
			logger.Error("render showcase", "error", err)
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if _, err := body.WriteTo(w); err != nil {
			logger.Warn("write showcase response", "error", err)
		}
	})
	return mux, nil
}

func dataFor(query url.Values, prefix string, catalog *chromaui.Catalog) (pageData, error) {
	appID := query.Get("app")
	if appID == "" {
		appID = "memory"
	}
	app, ok := demoApps[appID]
	if !ok {
		return pageData{}, fmt.Errorf("unknown app %q", appID)
	}
	theme := query.Get("theme")
	if theme == "" {
		theme = "system"
	}
	if _, ok := catalog.Theme(theme); !ok && theme != "system" {
		return pageData{}, fmt.Errorf("unknown theme %q", theme)
	}
	section := query.Get("section")
	if section == "" {
		section = app.Sections[0]
	}
	found := false
	items := make([]chromaui.MenuItem, 0, len(app.Sections))
	for _, label := range app.Sections {
		active := label == section
		found = found || active
		items = append(items, chromaui.MenuItem{
			Label: label, Href: pageURL(appID, theme, label, query.Get("enhance") != "0"),
			Icon: app.Symbol, Active: active,
		})
	}
	if !found {
		return pageData{}, fmt.Errorf("unknown section %q for app %q", section, appID)
	}
	if enhancement := query.Get("enhance"); enhancement != "" && enhancement != "0" && enhancement != "1" {
		return pageData{}, fmt.Errorf("unknown enhancement setting %q", enhancement)
	}
	enhanced := query.Get("enhance") != "0"
	return pageData{
		Header: chromaui.Header{
			Brand: app.Brand, BrandHref: pageURL(appID, theme, app.Sections[0], enhanced),
			PageTitle: section, Badge: app.Badge, MenuLabel: "Navigate",
			NavigationLabel: app.Brand + " navigation", Items: items,
		},
		App: app, Prefix: prefix, Theme: theme, Section: section, Enhanced: enhanced, Themes: catalog.Themes(),
		MemoryHref: pageURL("memory", theme, "Memories", enhanced),
		MailHref:   pageURL("mail", theme, "Mailboxes", enhanced),
		ToggleHref: pageURL(appID, theme, section, !enhanced),
	}, nil
}

func pageURL(app, theme, section string, enhanced bool) string {
	enhancement := "0"
	if enhanced {
		enhancement = "1"
	}
	return "/?" + url.Values{"app": {app}, "theme": {theme}, "section": {section}, "enhance": {enhancement}}.Encode()
}
