/** Placeholder feed until a real GraphQL `posts` query exists. */
export type MockPost = {
  id: string;
  username: string;
  displayName: string;
  imageSeed: string;
  /** If set (2+ seeds), post is a side-by-side compare; votes are per image in the UI. */
  compareSeeds?: string[];
  /** Titles for each compare column (same length as `compareSeeds` when set). */
  compareLabels?: string[];
  /** Initial vote counts per compare column (3+ columns only). */
  compareOptionCounts?: number[];
  likes: number;
  caption: string;
  timeAgo: string;
};

export const MOCK_STORIES = [
  { id: "1", username: "your_story", label: "Your story", isYou: true as const },
  { id: "2", username: "sarah_k", label: "Sarah", isYou: false as const },
  { id: "3", username: "alex_m", label: "Alex", isYou: false as const },
  { id: "4", username: "photo_lab", label: "PhotoLab", isYou: false as const },
  { id: "5", username: "travel", label: "Travel", isYou: false as const },
];

export const MOCK_POSTS: MockPost[] = [
  {
    id: "p1",
    username: "nature_daily",
    displayName: "Nature Daily",
    imageSeed: "1011",
    likes: 1240,
    caption: "Golden hour never gets old 🌅 #sunset #vibes",
    timeAgo: "2h",
  },
  {
    id: "p2",
    username: "city_views",
    displayName: "City Views",
    imageSeed: "1025",
    compareSeeds: ["1025", "1026"],
    compareLabels: ["Downtown glass", "Harbor sunset"],
    likes: 892,
    caption: "Which skyline hits harder? Tap an image to vote.",
    timeAgo: "5h",
  },
  {
    id: "p3",
    username: "minimal_home",
    displayName: "Minimal Home",
    imageSeed: "1060",
    compareSeeds: ["1060", "1061", "1062"],
    compareLabels: ["Reading nook", "Kitchen island", "Bedroom light"],
    compareOptionCounts: [420, 1180, 801],
    likes: 3401,
    caption: "Pick your favorite corner — tap to vote (demo: 3-way).",
    timeAgo: "1d",
  },
];
