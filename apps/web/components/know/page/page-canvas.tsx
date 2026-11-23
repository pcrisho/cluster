"use client"

import { useEffect, useRef, useState } from "react"

import {
  type PageDetail,
  type PageTreeNode,
  type Space,
  type Tag,
} from "@/lib/know-api"
import { useBreadcrumb } from "@/lib/breadcrumb-context"
import { useCollabDocument } from "@/lib/collab/use-collab-document"
import { renderPageContent } from "@/lib/know-utils"
import { pageTitle } from "@/lib/page-title"
import { addRecentPage } from "@/lib/recent-pages"
import { serializeRichText } from "@/lib/rich-text/content"
import { PageEditor } from "@/components/know/page-editor"
import { PageToc, extractToc } from "@/components/know/page-toc"
import { PageTitleBlock } from "@/components/know/page/page-title-block"
import { PageToolbar } from "@/components/know/page/page-toolbar"
import { usePageFields } from "@/components/know/page/use-page-fields"
import { useSpace } from "@/components/know/space/space-context"
import { AttachedFiles } from "@/components/shared/documents"
import { useTranslations } from "next-intl"

interface PageCanvasProps {
  page: PageDetail
  space: Space
  pages: PageTreeNode[]
  availableTags: Tag[]
  canEdit: boolean
  /** The page or the tree changed: fetch them again. */
  onChanged: () => void
}

/** One page: toolbar, title and body (live when collab is up), table of contents and files. */
export function PageCanvas({
  page,
  space,
  pages,
  availableTags,
  canEdit,
  onChanged,
}: PageCanvasProps) {
  const t = useTranslations("know.page")
  const { setItems: setBreadcrumb } = useBreadcrumb()
  const { refresh: refreshTree } = useSpace()
  const fields = usePageFields(page, onChanged)

  // Read in the lazy initializer so the mode survives a refresh without an effect.
  const [isEditing, setIsEditing] = useState(() => {
    if (typeof window === "undefined") return true
    return (
      window.sessionStorage.getItem(`know:page:edit:${page.id}`) !== "false"
    )
  })
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    queueMicrotask(() => setHydrated(true))
  }, [])
  const editing = hydrated && canEdit && isEditing

  // Title and body live in the collab document; `page` is the REST copy for the first paint,
  // the table of contents and the fallback when collab is unreachable.
  const collab = useCollabDocument({ kind: "know.page", id: page.id })
  const live = collab?.synced ?? false
  const canType = editing && collab?.status === "connected"
  const [liveTitle, setLiveTitle] = useState<string | null>(null)

  // Collab reports a demotion or promotion while the page is open; `myRole` on the REST copy,
  // which decides the edit controls, only catches up if the page is fetched again.
  const seenMode = useRef(collab?.mode)
  useEffect(() => {
    if (seenMode.current === collab?.mode) return
    seenMode.current = collab?.mode
    if (live) queueMicrotask(onChanged)
  }, [collab?.mode, live, onChanged])

  // The sidebar tree reads the saved copy, which collab writes a few seconds after typing stops.
  useEffect(() => {
    if (liveTitle === null) return
    const timer = setTimeout(() => void refreshTree(), 4000)
    return () => clearTimeout(timer)
  }, [liveTitle, refreshTree])

  useEffect(() => {
    const ancestors: { label: string; href?: string }[] = []
    const seen = new Set<string>()
    for (let id = page.parentId; id && !seen.has(id); ) {
      seen.add(id)
      const ancestor = pages.find((p) => p.id === id)
      if (!ancestor) break
      ancestors.unshift({
        label: pageTitle(ancestor.title),
        href: `/know/spaces/${space.id}/${ancestor.id}`,
      })
      id = ancestor.parentId
    }
    setBreadcrumb([
      { label: "Know", href: "/know" },
      { label: t("spaces"), href: "/know" },
      { label: space.name, href: `/know/spaces/${space.id}` },
      ...ancestors,
      { label: pageTitle(liveTitle ?? page.title) },
    ])
  }, [page.parentId, page.title, pages, space, liveTitle, setBreadcrumb, t])

  useEffect(() => {
    addRecentPage({
      id: page.id,
      title: pageTitle(page.title),
      spaceId: space.id,
      spaceName: space.name,
    })
  }, [page.id, page.title, space.id, space.name])

  const tocItems = extractToc(serializeRichText(page.content))

  return (
    <>
      <div className="mx-auto w-full max-w-3xl space-y-6 px-6 pt-4 pb-6 md:px-10">
        <PageToolbar
          page={fields.draft}
          pageTree={pages}
          availableTags={availableTags}
          canEdit={canEdit}
          collab={collab}
          savingState={fields.state}
          onToggleEdit={() => setIsEditing((v) => !v)}
          onStatusChange={fields.setStatus}
          onParentChange={fields.setParent}
          onTagsChange={fields.setTags}
          onChanged={onChanged}
        />

        <PageTitleBlock
          page={fields.draft}
          collab={collab}
          live={live}
          titleEditable={!!canType}
          canChangeIcon={editing}
          onTitleChange={setLiveTitle}
          onIconChange={fields.setIcon}
          onIconRemove={fields.removeIcon}
        />

        <article className="min-w-0">
          {live && collab ? (
            <PageEditor
              key={collab.generation}
              ydoc={collab.ydoc}
              provider={collab.provider}
              editable={!!canType}
              pageId={page.id}
              spaceId={space.id}
              spaceName={space.name}
              onPageCreated={onChanged}
            />
          ) : (
            <div
              className="prose prose-base max-w-none break-words prose-headings:scroll-mt-20 prose-headings:font-semibold prose-h1:text-3xl prose-h1:tracking-tight prose-h2:text-2xl prose-h2:tracking-tight prose-h3:text-xl"
              dangerouslySetInnerHTML={{
                __html: renderPageContent(serializeRichText(page.content)),
              }}
            />
          )}
        </article>

        {tocItems.length > 0 && <PageToc items={tocItems} />}
      </div>

      <AttachedFiles
        owner={{ kind: "page", id: page.id }}
        canUpload={canEdit}
        className="mx-auto mt-6 max-w-3xl px-6 pb-6 md:px-10 md:pb-10"
      />
    </>
  )
}
