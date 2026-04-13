/** Placeholder feed until a real GraphQL `posts` query exists. */
export type MockPost = {
  id: string;
  username: string;
  displayName: string;
  imageSeed: string;
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
    likes: 892,
    caption: "Concrete jungle where dreams are made of.",
    timeAgo: "5h",
  },
  {
    id: "p3",
    username: "minimal_home",
    displayName: "Minimal Home",
    imageSeed: "1060",
    likes: 3401,
    caption: "Sunday reset ✨",
    timeAgo: "1d",
  },
];
