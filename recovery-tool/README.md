# Knowledge Vault recovery tool

Opens an organization's **encrypted** documents without Knowledge Vault — the promise in
`docs/structure.md` §9.11, made demonstrable.

You need three things:

1. **The files from your storage.** For Google Drive, open the organization's
   *Knowledge Vault* folder in Drive and download it (Drive zips it; unzip it). For a NAS,
   copy the bucket's `objects/` folder.
2. **The organization's `.main` file**, exported from the Supreme zone. Export a fresh one
   after connecting storage — files exported before then carry no key.
3. **The Supreme password.**

Then, with Node.js 18 or later:

```bash
node kv-recover.mjs --main "Acme Robotics.main" --in ./knowledge-vault-folder --out ./recovered
```

It asks for the Supreme password (or reads `KV_SUPREME_PASSWORD`), and writes every
document it can open into `./recovered` under its original file name. Each one is checked
against the fingerprint recorded when it was uploaded; a document that was altered in
storage is reported, never written out.

**Readable (non-encrypted) organizations need none of this** — their documents are ordinary
files in the folder already.

The tool is one file with no dependencies, so it can be read end to end before it is
trusted. It never connects to the network.
