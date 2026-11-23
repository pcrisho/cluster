import { useTranslations } from "next-intl"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { SectionHeader } from "./section-header"

export function FaqSection() {
  const t = useTranslations("faq")

  const items = [
    { id: "q1", question: t("q1"), answer: t("a1") },
    { id: "q2", question: t("q2"), answer: t("a2") },
    { id: "q3", question: t("q3"), answer: t("a3") },
    { id: "q6", question: t("q6"), answer: t("a6") },
    { id: "q7", question: t("q7"), answer: t("a7") },
    { id: "q4", question: t("q4"), answer: t("a4") },
    { id: "q5", question: t("q5"), answer: t("a5") },
  ]

  return (
    <section id="faq" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 lg:gap-12">
          <div className="lg:col-span-2">
            <SectionHeader title={t("title")} subtitle={t("subtitle")} />
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 lg:col-span-3 lg:self-start">
            <Accordion type="single" collapsible className="w-full">
              {items.map((item) => (
                <AccordionItem key={item.id} value={item.id}>
                  <AccordionTrigger className="text-base font-medium hover:text-foreground hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  )
}
