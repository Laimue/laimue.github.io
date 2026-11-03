# Credits

LaiMue's reference hands (`refs.json`) are centre lines traced from these sources. They only nudge each copy of your letter a little toward styles that already look like yours.

## Fonts
- **Google Fonts** (SIL Open Font License 1.1): Mali, Itim, Charm, Charmonman, Srisakdi, Playpen Sans Thai, Sarabun, Niramit, Kodchasan, KoHo, Krub, K2D, Fahkwang, Thasadith, Taviraj, Trirong, Pridi, Maitree, Chonburi, Pattaya, Noto Sans Thai Looped, Noto Serif Thai, IBM Plex Sans Thai Looped, Prompt, Kanit, Mitr, Athiti, Anuphan, Bai Jamjuree, Chakra Petch, Noto Sans Thai, IBM Plex Sans Thai.
- **TLWG fonts-tlwg** (GPL with font exception): Purisa, Garuda, Kinnari, Loma, Norasi, Sawasdee, Umpush, Waree, Laksaman, Tlwg Typist, Tlwg Typo.
- **Sriracha** (SIL OFL 1.1, Cadson Demak): the typed letter, `lib/Sriracha-Regular.ttf`.
- **Kanit** (SIL OFL 1.1, Cadson Demak): headings, `lib/fonts/kanit-*.woff2` (Google Fonts Thai + Latin subsets).

## Handwriting datasets
Only averages of groups of 15 or more samples are used. No single person's writing and no images are included.
- **Burapha-TH**: *Burapha-TH: A Multi-Purpose Character, Digit, and Syllable Handwriting Dataset*, Applied Sciences 12(8):4083, 2022. https://services.informatics.buu.ac.th/datasets/Burapha-TH/
- **ALICE-THI**: O. Surinta, M.F. Karaaba, L.R.B. Schomaker and M.A. Wiering, *Recognition of handwritten characters using local gradient feature descriptors*, Engineering Applications of Artificial Intelligence 45 (2015) 405-414. https://www.ai.rug.nl/~mrolarik/ALICE-THI/
- **KVIS Thai OCR** (CC BY 4.0): https://data.mendeley.com/datasets/8nr3pbdk5c/1

Rebuild: `python tools/crowd.py` then `node tools/fonts.js`.

## Sentences to copy (bank.json)
- **Tatoeba** (CC BY 2.0 FR): Thai sentences from https://tatoeba.org, export https://downloads.tatoeba.org/exports/per_language/tha/tha_sentences.tsv.bz2 (filtered to Thai letters, wrapped into lines).
- The traditional Thai alphabet poem (เป็นมนุษย์สุดประเสริฐเลิศคุณค่า …), public domain.

Rebuild: unpack the export to `tools/cache/tatoeba/tha.tsv`, then `node tools/bank.js`.
