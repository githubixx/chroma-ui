// SPDX-License-Identifier: GPL-3.0-or-later

package chromaui

import (
	"crypto/sha256"
	"fmt"
	"io/fs"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
	"testing"
)

func TestOriginalThemeMetadataAndArtwork(t *testing.T) {
	// Fingerprints of the original VDR files, not regenerated library output.
	originals := map[string]string{
		"fitness/assets/noise.svg":                                       "90ec0b01e7bd68b7d92221148adbb6c75f883d0fb0dff620b85bc418ac9c48b7",
		"retro-arcade/assets/noise.svg":                                  "14ff350f15318219574f7d8d4f643c63679d158a81183f47737ace734049f6ae",
		"aurora-glass-1/assets/aurora-desktop.avif":                      "5fbae4d56cd01df73476f97a7263ef2754d0ca9c82ec302c0158c3e9d89978aa",
		"aurora-glass-1/assets/aurora-desktop.webp":                      "bf621f3920581952724d49a346924d76e44331bd8eaa10bad8e6eb2a45edeaff",
		"aurora-glass-1/assets/aurora-mobile.avif":                       "ba78261962917cded64038708d13d09c31130cd851ebd92dcf2d99753e2532f2",
		"aurora-glass-1/assets/aurora-mobile.webp":                       "d466bab570e6c1e378751f7cde6f709c8892eb2f47886b1de5cf8a6b2b21b303",
		"aurora-glass-1/assets/panel-gloss.svg":                          "3acd9536bdb8e5e89ec22f4fa3b383d054ad36277392fb86ec5299f6dd9926a9",
		"aurora-glass-1/assets/button-glint.svg":                         "d16fb1f6a11962cb9ccdd1ff2560af65e616f89479ff5178f4e6bbcbe8cf3af5",
		"luxury-1/assets/gloss-panel.svg":                                "578c9dc5de214b7347f14c8853195a1c4cc77b850868a49eca5d606e35d12384",
		"luxury-1/assets/gloss-pill.svg":                                 "dcb33f99368c12646ee65a36fb0daffbbd749105a0b9aa8031ad84da192aedfb",
		"golden-moon/assets/bg.svg":                                      "662e23a452e70a95035546e47310e36e36e3bca2c3fc3aa96658f623f571d581",
		"solar-system-1/assets/ea479543-e6c8-4684-8f93-ee70ddcdb6fb.png": "ab88417da7b3e55355f962a94f0b415b3411ecab881cd5790f8b58ddfdcd8161",
		"space-night-1/assets/space-night-desktop.avif":                  "ce4aa2b74e4c877d20bb8adb7b99c95249071e0fe3f17740d7196b93cc73add6",
		"space-night-1/assets/space-night-desktop.webp":                  "0a68369d9bc3a45769a4ef1740e52a02e0188a7fa387486beb27ce5c3f540177",
		"space-night-1/assets/space-night-desktop.png":                   "3c6f66b68d9d0b8c5c867f6d39835d637b30d6c01dd9ec0a7e04b94abaf7de06",
		"space-night-1/assets/space-night-mobile.avif":                   "6f890e6bf32a378f6f417be654914959a28c3260aadfea2d8b1c5ac72001bdda",
		"space-night-1/assets/space-night-mobile.webp":                   "c3c37fe86f1c09bacf362ca73eef101ea6df327cb4fe1e1804cdb75c941d00c8",
		"space-night-1/assets/space-night-mobile.png":                    "6838ee15f4083026127ada89df84e3b9e9ec9552e8022b38f964d4113c6294a7",
		"aurora-glass-1/theme.yaml":                                      "730f2edcf3b1ffc9177446db5c25c14d2c25bfa78a96ddbee0d17954f2e93129",
		"fitness/theme.yaml":                                             "7f4b3a56e04396026cf9fd38c73b7a10a65446b742be0811a635f5d9c18a2d25",
		"glas-1/theme.yaml":                                              "107fc6dfb5d15a9fc27d24c40c1b6cb6f9d97666d9279a73e288ad04b99946c0",
		"gold-1/theme.yaml":                                              "c94d84b496bff414f283b2ab90088f22532dcaabf870d48237fc0838495e9610",
		"golden-moon/theme.yaml":                                         "59be3ab5c2b10b9fa704eb2ec2d7b4da299d8eb1b3de87f6c936eaae6d640f19",
		"lighting-1/theme.yaml":                                          "41310919bdd2e09cc00b6fdea0d2d22dbcad3f8c2794def72c8a0fc4c36c92c2",
		"luxury-1/theme.yaml":                                            "9a3e3e847dfab43f1414e2aafe5e6cbd22bb8b1f7164cb04e13326389ed4a66a",
		"mantle-1/theme.yaml":                                            "bca1217c475612ae785637a0b0c735cd9bfe5a5ee882717ae483490b9b2bf242",
		"retro-arcade/theme.yaml":                                        "86cab315e531968a3e2f3c99a2fdb1835005e3a3db5a8f1eee6c58637741c887",
		"solar-system-1/theme.yaml":                                      "f4a04c9c78dc9783eb4f25b100e1ae786160798c79a8d8bcd08edeb8d2b9a73d",
		"space-night-1/theme.yaml":                                       "8bce3c52e5c6ce6bd6d301bb81498389f7e0307138b92c573e1b5f09c9ca09aa",
		"spaceship-blue-dark/theme.yaml":                                 "7c63a55d24de753ca00645342c8cff504198375382f3230538e1a0ebe535c8fc",
		"spaceship-blue-light/theme.yaml":                                "16e73dcd29ec31a2acd136821f98b0afa56a2c136ba06333cbd7d01cb9792dc1",
		"spaceship-cyan-dark/theme.yaml":                                 "d4be922bad8de7ed45ada4b6e7ef3974d67a106be5083ca26bb58349f35e9df3",
		"spaceship-cyan-light/theme.yaml":                                "c895b8d650a091052d68bd6baaf624049df42b50daa059592c935ac94db0973d",
		"spaceship-green-dark/theme.yaml":                                "1b0ae199928129d968807eab3b9a2d81e0f8bd3b2c1d9e03e8f4d71db6ca22db",
		"spaceship-green-light/theme.yaml":                               "148b6f195ba8b2adb3df5e99ab385ae1afae18cad1b723068ad7db0ac35165b6",
		"spaceship-magenta-dark/theme.yaml":                              "976833754e65785ff0c3a11d7a2e64b010c3c29c7f33f91dd003a9b12f35d913",
		"spaceship-magenta-light/theme.yaml":                             "70c2f0b90ed065378c907dcd10d5520d351a24225af199699881c301f7ec6a1c",
		"spaceship-mono-dark/theme.yaml":                                 "313a0070226bc6c30b5fd9628fad0ef90e3fb6384efc0f00bd537af62e96612b",
		"spaceship-mono-light/theme.yaml":                                "cd0f2b73bcbb7df67596d169821ba7f702f473d6c816ec20d44faa41bf43bf86",
		"spaceship-orange-dark/theme.yaml":                               "b768466f3bc64be4b3b4393ffd66018f8d14736dcef673b68a004becf2925c9a",
		"spaceship-orange-light/theme.yaml":                              "191ae72280dcfee125ca27afd8545b69978bbba36e705c46e5637d0064bd5581",
		"spaceship-purple-dark/theme.yaml":                               "a13ebc8e6c6d77e4f8d894215ee1437f9ba4b6ddd63fdeefbb2c9778ce0fc949",
		"spaceship-purple-light/theme.yaml":                              "f1d0eda00270cec1010e7dc5d174ffc9a4acb81dffa67c201542b74a3853d013",
		"spaceship-red-dark/theme.yaml":                                  "98b8d15c9b5a158a174de200758e007541200c570b411dcbfd2f4da540a20359",
		"spaceship-red-light/theme.yaml":                                 "89a7afbd2ca97458df8c3cba7d9f8f32f3c475f945261ccd7b649c614f123227",
		"spaceship-yellow-dark/theme.yaml":                               "142426d053599a746d582dd8ee1a24da367397f8a24da4624b7214db899d7e39",
		"spaceship-yellow-light/theme.yaml":                              "72fa96a6ec0bc8f7ac2f1acf6c2a78690b9ff88f5ef9364bb8c49c2b43a15236",
		"light/theme.yaml":                                               "eb72378f544a273887c8cb4c842737498cf885e7046fc4962f73bb53c3aeeae7",
		"dark/theme.yaml":                                                "f432880de43c102077b1c5d0f5e72dc7933308d1bea3acb346650d050d7e7ac7",
		"cartoon-1/theme.yaml":                                           "77b52eafb4bbba6df9cb97cc74c8603b206caf136c3ace82b27ec710d1294879",
		"metal-1/theme.yaml":                                             "96e1231e7c7ec3a3c3d663883a933f3e3fd3406335196bbf57104f80010244f3",
		"spaceship-2/theme.yaml":                                         "293a632e6012555cfb50f1c58e928baf05210ca2ae5fc7d099c96e643f92d1da",
		"spaceship-grey-dark/theme.yaml":                                 "b1d4c9a1b0f3dab566c8e732374c1dae6c2f7810ab2b6b92a14f17eec6b44cf8",
		"spaceship-grey-light/theme.yaml":                                "a2f914eece9aed38bc43f0a25b660e2245663f5e8380632730b11579f721ce3f",
		"crt-starfield-1/theme.yaml":                                     "0b6fe1359ba65bbb9dc9508e34e910fe7ed69f1132c2cf16c11e4c3db5054e57",
		"crt-starfield-1/assets/crt-hero-fade.webp":                      "b3d7ee1dca230a4bf363df7f1b33e30c83540b4561678b9ac18c62176c5d2457",
		"crt-starfield-1/assets/crt-sky.webp":                            "43c597fa4c32fb28e1ae2ea6af853a3d8eccd0a0489786351c42d4bc3b9833b2",
	}
	for _, id := range bundledIDs {
		if _, ok := originals[id+"/theme.yaml"]; !ok {
			t.Errorf("missing original metadata fingerprint for %s", id)
		}
		err := fs.WalkDir(assets, "assets/themes", func(name string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() || strings.HasSuffix(name, "/theme.css") {
				return nil
			}
			if _, ok := originals[strings.TrimPrefix(name, "assets/themes/")]; !ok {
				t.Errorf("unverified bundled file %s", name)
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	for file, fingerprint := range originals {
		data, err := assets.ReadFile("assets/themes/" + file)
		if err != nil {
			t.Fatal(err)
		}
		if got := fmt.Sprintf("%x", sha256.Sum256(data)); got != fingerprint {
			t.Errorf("original %s changed: %s", file, got)
		}
	}
}

func TestThemeReferencesArePortableAndPublic(t *testing.T) {
	catalog := newCatalog(t, nil)
	mux := http.NewServeMux()
	mux.Handle("/nested/skin/", http.StripPrefix("/nested/skin", catalog.Handler(nil)))
	urls := regexp.MustCompile(`url\(\s*['"]?([^'")\s]+)['"]?\s*\)`)
	appBindings := regexp.MustCompile(`\.(epg-[\w-]+|timer-[\w-]+|recording-[\w-]+|watchtv[\w-]*|page-[\w-]+|channels?-[\w-]+|nav-channel-form|timeline-[\w-]+)\b|/static/`)
	for _, theme := range catalog.Themes() {
		t.Run(theme.ID, func(t *testing.T) {
			css, err := assets.ReadFile("assets/themes/" + theme.ID + "/theme.css")
			if err != nil {
				t.Fatal(err)
			}
			if match := appBindings.Find(css); match != nil {
				t.Fatalf("theme requires application-specific binding %q", match)
			}
			for _, match := range urls.FindAllStringSubmatch(string(css), -1) {
				reference := match[1]
				if strings.HasPrefix(reference, "data:") || strings.HasPrefix(reference, "https://") {
					continue
				}
				parsed, err := url.Parse(reference)
				if err != nil {
					t.Fatal(err)
				}
				if parsed.IsAbs() || !fs.ValidPath(parsed.Path) || !strings.HasPrefix(parsed.Path, "assets/") {
					t.Fatalf("nonportable asset reference %q", reference)
				}
				expected, err := assets.ReadFile(path.Join("assets/themes", theme.ID, parsed.Path))
				if err != nil {
					t.Fatal(err)
				}
				got := response(mux, http.MethodGet, "/nested/skin/themes/"+theme.ID+"/"+reference)
				if got.Code != http.StatusOK || got.Body.String() != string(expected) {
					t.Fatalf("mounted asset %q: %d", reference, got.Code)
				}
				if got.Header().Get("Content-Type") != publicThemeType(parsed.Path) {
					t.Errorf("wrong content type for %q", reference)
				}
			}
		})
	}
}

func TestWholeOverrideDoesNotBorrowBundledArtwork(t *testing.T) {
	const asset = "/themes/crt-starfield-1/assets/crt-sky.webp"
	bundled := newCatalog(t, nil).Handler(nil)
	if got := response(bundled, http.MethodGet, asset); got.Code != http.StatusOK {
		t.Fatal("bundled artwork unavailable")
	}
	override := newCatalog(t, overrideTheme("crt-starfield-1", "Local CRT", ":root {}")).Handler(nil)
	if got := response(override, http.MethodGet, asset); got.Code != http.StatusNotFound {
		t.Fatalf("incomplete local override borrowed bundled artwork: %d", got.Code)
	}
}
