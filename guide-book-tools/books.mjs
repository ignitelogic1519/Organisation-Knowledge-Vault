// The books this repository publishes, and their reading order.
//
// Adding a chapter means adding its filename to the right `files` list — the build script
// reads nothing else, so a file left out of this list simply isn't in the PDF.

export const BOOKS = [
  {
    id: "main",
    dir: "Main Guide Book",
    pdf: "Knowledge-Vault-Main-Guide-Book.pdf",
    subtitle: "The Main Guide Book",
    footer: "Knowledge Vault — The Main Guide Book",
    coverLines: [
      "A complete, plain-language guide to using Knowledge Vault",
      "Chapters 1–20 · exams · the Mailbox · plans &amp; Knowledge Coins · flow diagrams",
    ],
    // Peach — the platform's own default theme.
    theme: {
      accent: "#d2603a",
      accent2: "#c9356e",
      coverFrom: "#fdf1e9",
      coverVia: "#f8e5da",
      coverTo: "#fbe9f0",
      tableHead: "#fbeee6",
      quote: "#fdf5f1",
    },
    files: [
      "README.md",
      "chapter-01-getting-started.md",
      "chapter-02-core-concepts.md",
      "chapter-03-founding-an-organization.md",
      "chapter-04-the-constellation.md",
      "chapter-05-building-your-structure.md",
      "chapter-06-people-and-governance.md",
      "chapter-07-courses.md",
      "chapter-08-the-studio.md",
      "chapter-09-exams-and-assessment.md",
      "chapter-10-the-library.md",
      "chapter-11-my-learning.md",
      "chapter-12-requests.md",
      "chapter-13-compliance.md",
      "chapter-14-the-mailbox.md",
      "chapter-15-plans-and-access.md",
      "chapter-16-supreme-and-custody.md",
      "chapter-17-appearance-and-navigation.md",
      "chapter-18-flow-diagrams.md",
      "chapter-19-help-and-support.md",
      "chapter-20-whats-new.md",
      "appendix-glossary-and-reference.md",
    ],
  },
  {
    id: "admin",
    dir: "Super Admin Guide Book",
    pdf: "Knowledge-Vault-Super-Admin-Guide-Book.pdf",
    subtitle: "The Super Admin Guide Book",
    footer: "Knowledge Vault — Super Admin Guide Book · INTERNAL",
    coverLines: [
      "The administration console behind Knowledge Vault",
      "Requests &amp; access codes · organizations · coins &amp; plans · administrators",
    ],
    coverWarning:
      "INTERNAL — Knowledge Base team only. Not for customers, and not published with the product.",
    // Slate — visibly a different book from the customer's one, at a glance on a desk.
    theme: {
      accent: "#3f4a63",
      accent2: "#6b7899",
      coverFrom: "#eef1f6",
      coverVia: "#e3e8f0",
      coverTo: "#edeff5",
      tableHead: "#eef1f7",
      quote: "#f4f6fa",
    },
    files: [
      "README.md",
      "chapter-01-the-portal.md",
      "chapter-02-requests-and-codes.md",
      "chapter-03-organizations-console.md",
      "chapter-04-coins-and-plans.md",
      "chapter-05-administrators-and-safety.md",
    ],
  },
];
