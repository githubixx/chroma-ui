// SPDX-License-Identifier: GPL-3.0-or-later

package chromaui

import (
	"errors"
	"fmt"
	"html/template"
)

// MenuItem is an application-owned navigation entry. Icon is escaped text,
// not trusted HTML. Applications choose visible entries and enforce access.
type MenuItem struct {
	Label  string
	Href   string
	Icon   string
	Active bool
}

// Header is the input to the "chroma/header" template.
// BrandHref defaults to "/", MenuLabel to "Menu", and NavigationLabel to
// "Primary". Empty PageTitle, Badge, and menu item icons are omitted.
type Header struct {
	Brand           string
	BrandHref       string
	PageTitle       string
	Badge           string
	MenuLabel       string
	NavigationLabel string
	Items           []MenuItem
}

// ParseTemplates adds embedded, HTML-escaped partials to an application's
// template set. Render "chroma/header" with Header data.
func ParseTemplates(t *template.Template) (*template.Template, error) {
	if t == nil {
		return nil, errors.New("chroma-ui: template set must not be nil")
	}
	parsed, err := t.ParseFS(assets, "templates/*.html")
	if err != nil {
		return nil, fmt.Errorf("chroma-ui: parse templates: %w", err)
	}
	return parsed, nil
}
