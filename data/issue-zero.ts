export type FeatureItem = {
  id: string;
  issueNumber: string;
  category: string;
  title: string;
  summary: string;
  image: string;
  imageAlt: string;
  pageIndex: number;
  panelSize: "narrow" | "standard" | "wide";
  panelClass?: string;
};

export const issueZeroFeatures: FeatureItem[] = [
  {
    id: "time",
    issueNumber: "000",
    category: "COVER STORY",
    title: "TIME, REPLAYED",
    summary: "What should a faithful remake remember?",
    image: "/assets/clue-ocarina.png",
    imageAlt: "A worn ceramic ocarina",
    pageIndex: 1,
    panelSize: "standard",
    panelClass: "ocarina",
  },
  {
    id: "vice",
    issueNumber: "000",
    category: "COUNTDOWN",
    title: "THE BIGGEST SHADOW",
    summary: "Seventy days until Leonida opens.",
    image: "/assets/clue-seat.png",
    imageAlt: "A gun resting on an empty car seat",
    pageIndex: 2,
    panelSize: "wide",
    panelClass: "vice",
  },
  {
    id: "tokon",
    issueNumber: "000",
    category: "PLAYER ONE",
    title: "DON’T MASH. LISTEN.",
    summary: "A true beginner’s guide to Tōkon.",
    image: "/assets/clue-shield.png",
    imageAlt: "A gouged round hero shield",
    pageIndex: 3,
    panelSize: "narrow",
    panelClass: "tokon",
  },
  {
    id: "afterimage",
    issueNumber: "000",
    category: "AFTERIMAGE",
    title: "THE FUTURE WAS PAINTED",
    summary: "Why the OVA look keeps returning.",
    image: "/assets/clue-vhs.png",
    imageAlt: "A battered INK//:PLAY VHS tape",
    pageIndex: 4,
    panelSize: "wide",
    panelClass: "vhs",
  },
];
