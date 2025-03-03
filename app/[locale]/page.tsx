import PageHeader from "@/components/page-header"
import FAQ from "@/components/converter/FAQ"
import CTA from "@/components/converter/CTA"
import Features from "@/components/converter/Features"
import HowTo from "@/components/converter/HowTo"
import { useTranslations } from "next-intl"
import FileUploader from "@/components/file-uploader"
export const runtime = 'edge';
export default function Home() {
    const t = useTranslations("")
    return (
        <section>
            <div className="pt-32 pb-12 md:pt-44 md:pb-20">
                <div className="px-4 sm:px-6">
                    <PageHeader
                        className="mb-12"
                        title={t('h1')}
                        description={t('description')}
                    />
                    <FileUploader />
                    <Features />
                    <HowTo />
                    <FAQ />
                    <CTA />
                </div>
            </div>
        </section>
    )
}
