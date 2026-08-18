# Genesis High-Fidelity Slice — Asset Manifest

Wszystkie assety w tym katalogu są pobrane z [Poly Haven](https://polyhaven.com/) i są objęte licencją **CC0 1.0 Universal**. Poly Haven potwierdza, że assety można wykorzystywać, redystrybuować oraz stosować komercyjnie bez obowiązku atrybucji: <https://polyhaven.com/license>.

| Rola | Lokalne URI | Źródłowy asset | Wariant | SHA-256 |
| --- | --- | --- | --- | --- |
| Environment HDRI | `/assets/genesis-hf/hdr/braustuble_alley_1k.hdr` | `braustuble_alley` | HDR 1K | `af4ef72e21c37d81547faf5b938180926a055a230634fcf8a047ddeef3629d70` |
| Asfalt: base color | `/assets/genesis-hf/pbr/asphalt/diffuse.jpg` | `asphalt_02` | JPG 1K | `1aa5ce99f58a625c71d48cfc3e68b65ca85ccb00f39e045c0a928608a0ea25ed` |
| Asfalt: normal | `/assets/genesis-hf/pbr/asphalt/normal.jpg` | `asphalt_02` | OpenGL normal, JPG 1K | `42a1c381b53204e83a982db2864479a30bc127bbdeebb1006f8ee51bff099df3` |
| Asfalt: roughness | `/assets/genesis-hf/pbr/asphalt/roughness.jpg` | `asphalt_02` | JPG 1K | `70ba3edc65525eb4dc366cf010ca7ae0bd34e0251ff0225c2dad627a873d0712` |
| Chodnik: base color | `/assets/genesis-hf/pbr/concrete/diffuse.jpg` | `concrete_pavement` | JPG 1K | `70d3ff969a7421c7ae057b5d16386d11f5e59c6740db643352e1039413f419c4` |
| Chodnik: normal | `/assets/genesis-hf/pbr/concrete/normal.jpg` | `concrete_pavement` | OpenGL normal, JPG 1K | `a5009e409ff0f7b2d19e1316fe5e2b2b4f28e4a6b79990a664be69d4e8a0e690` |
| Chodnik: roughness | `/assets/genesis-hf/pbr/concrete/roughness.jpg` | `concrete_pavement` | JPG 1K | `99f81099af07b009134b6a81bf0f95ab16da09c57156cc2ed534975664a68533` |
| Fasada: base color | `/assets/genesis-hf/pbr/brick/diffuse.jpg` | `brick_wall_001` | JPG 1K | `6a1233ec0186703de830354d89f122991e61e67fb67e0846c7eaf6c5aefea902` |
| Fasada: normal | `/assets/genesis-hf/pbr/brick/normal.jpg` | `brick_wall_001` | OpenGL normal, JPG 1K | `8afbe3919308b168a6b7235fe7b930f670cfffa1a34de39ee790d55c9d7bda09` |
| Fasada: roughness | `/assets/genesis-hf/pbr/brick/roughness.jpg` | `brick_wall_001` | JPG 1K | `a23342b02e6c5af106aaece16130aa9153a801cb1a84d5f3e0d06ce248677f38` |
| Człowiek LOD0 — oryginał | `/assets/genesis-hf/characters/mpfb.glb` | [`met4citizen/TalkingHead`, `avatars/mpfb.glb`](https://github.com/met4citizen/TalkingHead/blob/main/avatars/mpfb.glb) | GLB 35,1 MB; MakeHuman/MPFB | `63c645a2a863b9972e9a9c2ed576a1de4c390b8475508e1473e69c87a3ee299c` |
| Człowiek LOD0 — runtime | `/assets/genesis-hf/characters/mpfb-lod0.glb` | Wariant techniczny powyższego assetu CC0 | GLB 16,8 MB; tekstury 1024 px WebP; brak zmiany licencji | `ec47cffd0a56d201869afb9c10ea957e237c55d4e12c197fc9d9c30d5772a8d2` |

Model `mpfb.glb` jest deklarowany przez autorów jako asset **CC0**: [fragment README z licencją](https://github.com/met4citizen/TalkingHead/blob/main/README.md#license-information). `mpfb-lod0.glb` jest jego technicznym wariantem runtime utworzonym lokalnie wyłącznie przez zmniejszenie tekstur do 1024 px, transkodowanie WebP i `prune`; nie zmienia licencji, semantyki ani pochodzenia. Oba pliki są wyłącznie assetami LOD0; nie są kopią, źródłem ani właścicielem danych `SimAgent`.

Asset manifest wprowadza wyłącznie reprezentację graficzną. Nie jest World State i nie zawiera parametrów naukowych, populacji, wydarzeń ani danych pochodzących od użytkowników.
