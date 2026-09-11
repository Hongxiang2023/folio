# Citation Style Language assets

Folio uses styles and locale data from the **Citation Style Language project**: https://citationstyles.org/. Its style manager searches Zotero's catalog and downloads compatible styles from the official CSL repository's `v1.0.2` branch. Downloaded XML retains the original author, contributor, and rights notices. Files are stored locally with source links and installation dates; dependent styles retain both their own XML and their parent styles. Imported custom files retain their embedded notices and remain subject to their authors' licensing terms.

The files in `server/styles/` are third-party works, distributed unchanged under the **Creative Commons Attribution-ShareAlike 3.0 Unported license (CC BY-SA 3.0)**. They are not covered by Folio's MIT license. All embedded author, contributor, translator, rights, and source notices have been retained. Attribution applies to the original authors and all contributors credited inside each file and in the linked upstream repositories.

License: https://creativecommons.org/licenses/by-sa/3.0/
Full legal terms: https://creativecommons.org/licenses/by-sa/3.0/legalcode

| File | Attribution | Source |
| --- | --- | --- |
| `apa.csl` | Brenton M. Wiernik and Andrew Dunning; APA Style 7th edition | https://github.com/citation-style-language/styles/blob/master/apa.csl |
| `chicago-author-date.csl` | Andrew Dunning and credited contributors; Chicago Manual of Style 18th edition (author-date) | https://github.com/citation-style-language/styles/blob/master/chicago-author-date.csl |
| `vancouver.csl` | Michael Berkowitz; contributors Sean Takats and Sebastian Karcher | https://github.com/citation-style-language/styles/blob/5e762f49be0ff19290160a08bfe0202c7d5d729d/vancouver.csl |
| `locales-en-US.xml` | Translators Andrew Dunning, Sebastian Karcher, Rintze M. Zelle, Denis Meier, and Brenton M. Wiernik | https://github.com/citation-style-language/locales/blob/master/locales-en-US.xml |

Downloaded September 8, 2026. Vancouver is pinned to the last repository revision before its upstream rename; the other files are unmodified snapshots of their upstream master branches. SHA-256 hashes identify the bundled versions:

```text
1ece4fb3c295e66d04b4394e295aa58a87741ceeef1658192437eb9953c2f13e  apa.csl
002fade78d7e4fe9d42936a16b43a8066b097013f6255df40b1bfba6631eff9b  chicago-author-date.csl
3444eab9501a741cb0e265147caf01d2c00da16d9fe60201c546c5b9831178a6  vancouver.csl
ac864c7c21166b4390d82c31792cdc509400727fa0060b43d8aa17e07f9cb079  locales-en-US.xml
```

When redistributing or adapting these assets, retain attribution and license links; indicate modifications and distribute adaptations under the applicable ShareAlike terms. The citation engine is citeproc-js, whose license is provided by its npm package. These styles and locale files do not imply endorsement by their authors or publishers.

Additional unchanged snapshots bundled September 9, 2026, with attribution to the authors and contributors in each XML file:

- `nature.csl`: https://github.com/citation-style-language/styles/blob/v1.0.2/nature.csl
- `science.csl`: https://github.com/citation-style-language/styles/blob/v1.0.2/science.csl
- `cell.csl`: https://github.com/citation-style-language/styles/blob/v1.0.2/cell.csl
- `the-new-england-journal-of-medicine.csl`: https://github.com/citation-style-language/styles/blob/v1.0.2/the-new-england-journal-of-medicine.csl
- `ieee.csl`: https://github.com/citation-style-language/styles/blob/v1.0.2/ieee.csl
- `nature-medicine.csl`: https://github.com/citation-style-language/styles/blob/v1.0.2/dependent/nature-medicine.csl
- `locales-en-GB.xml`: https://github.com/citation-style-language/locales/blob/master/locales-en-GB.xml

```text
d7572c372d3ed5dfd73420b1681af3607ef475141e1d6f1b415033b723d83124  nature.csl
4a9b4bac4a5d6d87af8ee492f543d7236ab4a54587bb44139ac62fd0bc18ac93  science.csl
8c02f186709cd105cf2a6a09c51f5d3d9aacf9d788158f48b2cb16e1e8a562c1  cell.csl
d6cd6c6fdd81d2faecba0bfac0bd76faaab63b6fd851dc383631eadb7fc28895  the-new-england-journal-of-medicine.csl
6dee2b87ce90a7ab86f232d78a9216f47adc6193f13b6307b4a83c65594e721a  ieee.csl
47d1018d859bd5c0fe39759b937bf4e4311580e03f7206cb5c14d9f419063cd3  nature-medicine.csl
e4a1fed9cec04b5fed5e9027b4055925cd4d8f7c9fe233eb0ceca6d4be3999f6  locales-en-GB.xml
```
