// SPDX-License-Identifier: GPL-3.0-or-later

package chromaui

import (
	"bytes"
	"html/template"
	"strings"
	"testing"
)

func TestHeaderApplicationContentAndEscaping(t *testing.T) {
	templates, err := ParseTemplates(template.New("app").Funcs(template.FuncMap{
		"applicationTitle": func() string { return "Application content" },
	}))
	if err != nil {
		t.Fatal(err)
	}
	templates, err = templates.Parse(`{{define "app"}}{{applicationTitle}}{{template "chroma/header" .}}{{end}}`)
	if err != nil {
		t.Fatal(err)
	}
	header := Header{
		Brand: "Memory <Desk>", BrandHref: "/memories", PageTitle: "Albums & notes",
		Badge: "Curator", MenuLabel: "Navigate", NavigationLabel: "Collections",
		Items: []MenuItem{
			{Label: "Albums", Href: "/albums", Icon: "+", Active: true},
			{Label: "<script>unsafe</script>", Href: "javascript:alert(1)", Icon: "<img>"},
		},
	}
	var body bytes.Buffer
	if err := templates.ExecuteTemplate(&body, "app", header); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"Application content", "Memory &lt;Desk&gt;", `href="/memories"`, "Albums &amp; notes",
		">Curator</span>", `aria-label="Navigate"`, `aria-label="Collections"`,
		`href="/albums" class="active" aria-current="page"`, `class="nav-item-icon"`,
		"&lt;script&gt;unsafe&lt;/script&gt;", "&lt;img&gt;", "#ZgotmplZ",
	} {
		if !strings.Contains(body.String(), want) {
			t.Errorf("missing %q in %s", want, &body)
		}
	}
	for _, forbidden := range []string{"VDRAdmin", "/recordings", `role="menu"`, "javascript:", "<script>", "<img>"} {
		if strings.Contains(body.String(), forbidden) {
			t.Errorf("application coupling or unsafe markup %q in %s", forbidden, &body)
		}
	}
	if strings.Count(body.String(), `aria-current="page"`) != 1 {
		t.Fatal("active state not controlled by application data")
	}
}

func TestHeaderDefaultsAndOptionalBadge(t *testing.T) {
	templates, err := ParseTemplates(template.New("app"))
	if err != nil {
		t.Fatal(err)
	}
	var body bytes.Buffer
	if err := templates.ExecuteTemplate(&body, "chroma/header", Header{Brand: "Mail Console"}); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`href="/"`, `aria-label="Menu"`, `aria-label="Primary"`, "Mail Console"} {
		if !strings.Contains(body.String(), want) {
			t.Errorf("missing documented default %q", want)
		}
	}
	if strings.Contains(body.String(), `class="nav-user"`) || strings.Contains(body.String(), `class="nav-item-icon"`) {
		t.Fatal("empty badge/icon rendered")
	}
	if _, err := ParseTemplates(nil); err == nil {
		t.Fatal("nil template set accepted")
	}
}
