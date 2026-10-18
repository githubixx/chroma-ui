// SPDX-License-Identifier: GPL-3.0-or-later

package chromaui_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"

	"github.com/githubixx/chroma-ui"
)

func ExampleNewCatalog() {
	catalog, err := chromaui.NewCatalog(nil)
	if err != nil {
		panic(err)
	}
	for _, theme := range catalog.Themes() {
		fmt.Println(theme.ID)
	}
	// Output:
	// aurora-glass-1
	// cartoon-1
	// crt-starfield-1
	// dark
	// fitness
	// glas-1
	// gold-1
	// golden-moon
	// light
	// lighting-1
	// luxury-1
	// mantle-1
	// metal-1
	// retro-arcade
	// solar-system-1
	// space-night-1
	// spaceship-2
	// spaceship-blue-dark
	// spaceship-blue-light
	// spaceship-cyan-dark
	// spaceship-cyan-light
	// spaceship-green-dark
	// spaceship-green-light
	// spaceship-grey-dark
	// spaceship-grey-light
	// spaceship-magenta-dark
	// spaceship-magenta-light
	// spaceship-mono-dark
	// spaceship-mono-light
	// spaceship-orange-dark
	// spaceship-orange-light
	// spaceship-purple-dark
	// spaceship-purple-light
	// spaceship-red-dark
	// spaceship-red-light
	// spaceship-yellow-dark
	// spaceship-yellow-light
}

func ExampleCatalog_Handler() {
	catalog, err := chromaui.NewCatalog(nil)
	if err != nil {
		panic(err)
	}
	mux := http.NewServeMux()
	mux.Handle("/my-app/ui/", http.StripPrefix("/my-app/ui", catalog.Handler(nil)))

	request := httptest.NewRequest(http.MethodGet, "/my-app/ui/themes/light/theme.css", nil)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	fmt.Println(response.Code)
	fmt.Println(response.Header().Get("Content-Type"))
	// Output:
	// 200
	// text/css; charset=utf-8
}
