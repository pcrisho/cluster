"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeftIcon, DownloadIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { MAX_BYTES } from "@cluster/editor-schema"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { PageContainer, PageHeader } from "@/components/layout/page"
import { RequireAdmin } from "@/components/shared/require-admin"
import {
  ImportDropzone,
  type DropzoneError,
} from "@/components/settings/import/import-dropzone"
import { ImportReportView } from "@/components/settings/import/import-report"
import { ImportResultView } from "@/components/settings/import/import-result"
import { saveFile } from "@/components/settings/import/save-file"
import { adminApi, type ImportReport, type ImportResult } from "@/lib/admin-api"
import { ApiError, getErrorMessage } from "@/lib/api"
import { catalogType } from "@/lib/documents/file-types"

/** The report a 422 carries, if this error is one. */
function reportOf(err: unknown): ImportReport | null {
  if (!(err instanceof ApiError) || err.code !== "IMPORT_INVALID") return null
  return (err.details as { report?: ImportReport } | undefined)?.report ?? null
}

export default function ImportMembersPage() {
  const t = useTranslations("settings.import")
  const tc = useTranslations("common")
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<DropzoneError | null>(null)
  const [checking, setChecking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [sendInvitations, setSendInvitations] = useState(false)
  const [mailEnabled, setMailEnabled] = useState(false)
  const [result, setResult] = useState<{
    data: ImportResult
    invited: boolean
  } | null>(null)
  // A slow preview of a file the person already replaced must not overwrite the newer one.
  const latest = useRef(0)

  useEffect(() => {
    adminApi
      .getPublicInstance()
      .then((i) => setMailEnabled(i.mailEnabled))
      .catch(() => {})
  }, [])

  async function downloadTemplate() {
    try {
      const { blob } = await adminApi.importTemplate()
      saveFile(blob, "cluster-import.xlsx")
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  function describe(err: unknown): DropzoneError {
    const message = getErrorMessage(err)
    if (err instanceof ApiError && err.code === "IMPORT_HEADERS") {
      const p = err.params ?? {}
      const details = (["missing", "unknown", "duplicate"] as const)
        .filter((k) => p[k])
        .map((k) => t(`headers.${k}`, { list: String(p[k]) }))
      return { message, details }
    }
    return { message }
  }

  async function preview(chosen: File) {
    const run = ++latest.current
    setFile(chosen)
    setReport(null)
    setError(null)
    setChecking(true)
    try {
      const type = catalogType(chosen, "spreadsheet")
      if (!type) throw new ApiError("", "SPREADSHEET_TYPE_UNSUPPORTED", 400)
      if (chosen.size > MAX_BYTES.spreadsheet)
        throw new ApiError("", "SPREADSHEET_TOO_LARGE", 400)
      const found = await adminApi.importPreview(chosen)
      if (run === latest.current) setReport(found)
    } catch (err) {
      if (run === latest.current) setError(describe(err))
    } finally {
      if (run === latest.current) setChecking(false)
    }
  }

  async function apply() {
    if (!file) return
    setApplying(true)
    const invite = mailEnabled && sendInvitations
    try {
      const data = await adminApi.importApply(file, invite)
      setResult({ data, invited: invite })
    } catch (err) {
      const found = reportOf(err)
      if (found) setReport(found)
      else if (err instanceof ApiError && err.code === "IMPORT_CONFLICT") {
        toast.error(getErrorMessage(err))
        void preview(file)
      } else toast.error(getErrorMessage(err))
    } finally {
      setApplying(false)
    }
  }

  function reset() {
    latest.current++
    setFile(null)
    setReport(null)
    setError(null)
    setChecking(false)
    setResult(null)
    setSendInvitations(false)
  }

  const blocked = !!report && report.errors.length > 0
  const empty =
    !!report &&
    report.create + report.update === 0 &&
    report.nodesToCreate.length === 0 &&
    report.managersReplaced.length === 0

  return (
    <PageContainer width="wide">
      <RequireAdmin>
        <PageHeader
          title={t("title")}
          description={t("description")}
          actions={
            !result && (
              <Button variant="outline" onClick={downloadTemplate}>
                <DownloadIcon data-icon="inline-start" />
                {t("template")}
              </Button>
            )
          }
        />
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/settings/members">
              <ArrowLeftIcon data-icon="inline-start" />
              {t("back")}
            </Link>
          </Button>
        </div>

        {result ? (
          <ImportResultView
            result={result.data}
            invited={result.invited}
            onAnother={reset}
          />
        ) : (
          <div className="flex flex-col gap-6">
            <ImportDropzone
              file={file}
              busy={checking}
              error={error}
              onFile={(f) => void preview(f)}
            />

            {report && (
              <>
                <ImportReportView report={report} />

                <div className="flex flex-col gap-4 rounded-xl border p-4">
                  {blocked ? (
                    <p className="text-sm text-muted-foreground">
                      {t("blocked")}
                    </p>
                  ) : (
                    <>
                      {mailEnabled ? (
                        <Field orientation="horizontal">
                          <FieldContent>
                            <FieldLabel htmlFor="import-invite">
                              {t("sendInvitations")}
                            </FieldLabel>
                            <FieldDescription>
                              {t("sendInvitationsHelp")}
                            </FieldDescription>
                          </FieldContent>
                          <Switch
                            id="import-invite"
                            checked={sendInvitations}
                            onCheckedChange={setSendInvitations}
                          />
                        </Field>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {t("mailOff")}
                        </p>
                      )}
                      {empty && (
                        <p className="text-sm text-muted-foreground">
                          {t("nothingToApply")}
                        </p>
                      )}
                    </>
                  )}
                  <div>
                    <Button
                      disabled={blocked || empty || applying}
                      onClick={() => setConfirming(true)}
                    >
                      {applying && <Spinner data-icon="inline-start" />}
                      {applying ? t("applying") : t("apply")}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("confirmBody", {
                  create: report?.create ?? 0,
                  update: report?.update ?? 0,
                  areas: report?.nodesToCreate.length ?? 0,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirming(false)
                  void apply()
                }}
              >
                {t("apply")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </RequireAdmin>
    </PageContainer>
  )
}
