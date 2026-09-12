import type { EditorialDocument } from "../lib/document";
export const tokonGuide: EditorialDocument = {
  schemaVersion: 1,
  header: {
    eyebrow: "GAMING · BEGINNER GUIDE",
    title: "Tōkon: What the First Ten Hours Don’t Tell You",
    panelHeadline: "Tōkon’s first ten hours",
    deck: "A practical first-week guide to learning the panel without wasting the lessons loss can offer.",
    standfirst:
      "Start with one fighter, one defensive answer, and a reason to return.",
    byline: "KOMA://PLAY Editorial",
    hero: {
      id: "hero",
      src: "/assets/clue-shield.png",
      alt: "A gouged round hero shield",
      rights: "Original KOMA://PLAY development asset",
    },
    heroCaption: "Development artwork · KOMA://PLAY",
  },
  modules: [
    {
      id: "tokon-opening",
      type: "paragraph",
      version: 1,
      content: {
        text: "The first ten hours of Tōkon teach a simple lesson: precision is more useful than spectacle. Begin by making one response reliable.",
      },
    },
    {
      id: "tokon-meter",
      type: "heading",
      version: 1,
      content: { text: "Meter and resources" },
    },
    {
      id: "tokon-image",
      type: "image",
      version: 1,
      presentation: "wide",
      content: {
        src: "/assets/clue-shield.png",
        alt: "A shield used as a development screenshot placeholder",
        caption: "Guard first, then learn the space it creates.",
        source: "KOMA://PLAY development asset",
        rights: "Original KOMA://PLAY development asset",
        citation: "[P//03]",
      },
    },
    {
      id: "tokon-strategy",
      type: "strategy",
      version: 1,
      content: {
        label: "PLAYER STRATEGY",
        title: "Don’t spend meter too early",
        text: "Keeping meter available can be more valuable while learning defensive responses.",
      },
    },
    {
      id: "tokon-gallery",
      type: "gallery",
      version: 1,
      presentation: "carousel",
      content: {
        slides: [
          {
            id: "tokon-slide-one",
            src: "/assets/clue-shield.png",
            alt: "A round shield with scored surface",
            caption: "Defence begins with one dependable answer.",
            source: "KOMA://PLAY development asset",
            rights: "Original KOMA://PLAY development asset",
            citation: "[P//03]",
          },
          {
            id: "tokon-slide-two",
            src: "/assets/coastal-countdown.png",
            alt: "Original development placeholder artwork with a coastal scene",
            caption: "Learn the route before expanding the route.",
            source: "KOMA://PLAY development asset",
            rights: "Original KOMA://PLAY development asset",
          },
          {
            id: "tokon-slide-three",
            src: "/assets/return-of-time.png",
            alt: "Original development placeholder artwork with a clock motif",
            caption: "Repeat a useful situation deliberately.",
            source: "KOMA://PLAY development asset",
            rights: "Original KOMA://PLAY development asset",
          },
        ],
      },
    },
    {
      id: "tokon-video",
      type: "video-text",
      version: 1,
      content: {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "Placeholder test video",
        text: "A clearly marked development-only embed demonstrates the responsive video module. Replace it before publication.",
      },
    },
    {
      id: "tokon-sources",
      type: "source",
      version: 1,
      content: {
        title: "Official game reference",
        url: "https://www.youtube.com/",
      },
    },
    {
      id: "tokon-close",
      type: "closing-cta",
      version: 1,
      content: {
        text: "Bring a correction, strategy, source or perspective to the next revision.",
        label: "ADD TO THIS EDITORIAL →",
        href: "#workshop-link",
      },
    },
  ],
};
