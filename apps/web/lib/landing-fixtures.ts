import { Post, DirectoryUser, CelebrationItem } from "@/lib/connect-api"

const NOW = new Date().toISOString()
const ISO = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

/** A one-paragraph post body, serialized like the composer's output. */
const paragraph = (text: string) =>
  JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  })

const author = (firstName: string, lastName: string, id: string) => ({
  id,
  firstName,
  lastName,
  avatarUrl: null,
  role: "COLLABORATOR",
})

export const LANDING_POSTS: Post[] = [
  {
    id: "fixture-post-1",
    type: "ANNOUNCEMENT",
    isPinned: true,
    pinnedExpiresAt: ISO(1000 * 60 * 60 * 24 * 7),
    title: "Welcome to your new workspace",
    body: paragraph(
      "We're rolling out Cluster across the company this week. Take a few minutes to set up your profile and pin the spaces you'll use daily."
    ),
    excerpt: null,
    images: [],
    authorId: "fixture-user-hr",
    createdAt: ISO(-1000 * 60 * 60 * 6),
    updatedAt: NOW,
    author: author("Lucía", "Mendoza", "fixture-user-hr"),
    _count: { likes: 24, comments: 5 },
    likedByMe: false,
    recentLikers: [],
  },
  {
    id: "fixture-post-2",
    type: "POST",
    isPinned: false,
    pinnedExpiresAt: null,
    title: null,
    body: paragraph(
      "Just shipped the new onboarding page — feedback welcome. Also pushing a small fix to the search shortcut on the way out."
    ),
    excerpt: null,
    images: [],
    authorId: "fixture-user-eng",
    createdAt: ISO(-1000 * 60 * 60 * 2),
    updatedAt: NOW,
    author: author("Diego", "Salinas", "fixture-user-eng"),
    _count: { likes: 12, comments: 3 },
    likedByMe: false,
    recentLikers: [],
  },
  {
    id: "fixture-post-3",
    type: "POST",
    isPinned: false,
    pinnedExpiresAt: null,
    title: null,
    body: paragraph(
      "Sharing the Q1 roadmap draft — thoughts? Particularly curious what teams think about the calendar split we're proposing."
    ),
    excerpt: null,
    images: [],
    authorId: "fixture-user-pm",
    createdAt: ISO(-1000 * 60 * 60 * 28),
    updatedAt: NOW,
    author: author("Renata", "Castro", "fixture-user-pm"),
    _count: { likes: 31, comments: 9 },
    likedByMe: false,
    recentLikers: [],
  },
]

const orgNode = (id: string, name: string) => ({
  id,
  name,
})

const position = (id: string, name: string) => ({
  id,
  name,
})

export const LANDING_DIRECTORY: DirectoryUser[] = [
  {
    id: "fixture-dir-1",
    firstName: "Diego",
    lastName: "Salinas",
    role: "COLLABORATOR",
    avatarUrl: null,
    profile: {
      bio: "Engineer focused on the knowledge base. Writes weekly about internal tooling.",
      orgNode: orgNode("o-eng", "Engineering"),
      position: position("p-eng", "Senior Software Engineer"),
    },
  },
  {
    id: "fixture-dir-2",
    firstName: "Lucía",
    lastName: "Mendoza",
    role: "ADMIN",
    avatarUrl: null,
    profile: {
      bio: "People Operations lead. Owns onboarding, culture, and internal communications.",
      orgNode: orgNode("o-people", "People"),
      position: position("p-people-lead", "Head of People"),
    },
  },
  {
    id: "fixture-dir-3",
    firstName: "Renata",
    lastName: "Castro",
    role: "MANAGER",
    avatarUrl: null,
    profile: {
      bio: "Product manager for GROW. Curates the internal learning paths.",
      orgNode: orgNode("o-product", "Product"),
      position: position("p-pm", "Senior Product Manager"),
    },
  },
  {
    id: "fixture-dir-4",
    firstName: "Marco",
    lastName: "Quispe",
    role: "COLLABORATOR",
    avatarUrl: null,
    profile: {
      bio: "Brand designer. Maintains the Cluster design system and component library.",
      orgNode: orgNode("o-design", "Design"),
      position: position("p-design", "Brand Designer"),
    },
  },
  {
    id: "fixture-dir-5",
    firstName: "Sofía",
    lastName: "Aguilar",
    role: "COLLABORATOR",
    avatarUrl: null,
    profile: {
      bio: "Customer success lead. Connects user feedback back to product and support.",
      orgNode: orgNode("o-cs", "Customer Success"),
      position: position("p-cs", "Customer Success Lead"),
    },
  },
  {
    id: "fixture-dir-6",
    firstName: "Andrés",
    lastName: "Rojas",
    role: "COLLABORATOR",
    avatarUrl: null,
    profile: {
      bio: "Backend engineer. Currently building the search and indexing pipeline.",
      orgNode: orgNode("o-eng", "Engineering"),
      position: position("p-eng-jr", "Software Engineer"),
    },
  },
]

export const LANDING_CELEBRATIONS: {
  birthdays: CelebrationItem[]
  anniversaries: CelebrationItem[]
} = {
  birthdays: [
    {
      id: "fixture-b-1",
      firstName: "Lucía",
      lastName: "Mendoza",
      avatarUrl: null,
      type: "BIRTHDAY",
      age: 31,
      reacted: false,
      reaction: null,
    },
    {
      id: "fixture-b-2",
      firstName: "Marco",
      lastName: "Quispe",
      avatarUrl: null,
      type: "BIRTHDAY",
      age: 28,
      reacted: false,
      reaction: null,
    },
  ],
  anniversaries: [
    {
      id: "fixture-a-1",
      firstName: "Diego",
      lastName: "Salinas",
      avatarUrl: null,
      type: "ANNIVERSARY",
      years: 3,
      reacted: false,
      reaction: null,
    },
  ],
}
