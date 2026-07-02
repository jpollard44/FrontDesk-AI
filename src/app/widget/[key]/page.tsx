import { notFound } from "next/navigation";
import ChatWidget from "@/components/ChatWidget";
import { BusinessConfigSchema } from "@/lib/config";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// The production widget, rendered inside the iframe that embed.js injects
// on client websites. Resolved by embed key, not slug.
export default async function WidgetPage({ params }: { params: { key: string } }) {
  if (!supabaseConfigured()) notFound();

  const { data } = await supabase()
    .from("clients")
    .select("config, status")
    .eq("embed_key", params.key)
    .maybeSingle();
  if (!data || data.status !== "active") notFound();

  const config = BusinessConfigSchema.parse(data.config);

  return (
    <div className="widget-page">
      <ChatWidget
        businessName={config.business_name}
        accentColor={config.widget_color}
        suggestedQuestions={config.suggested_questions.slice(0, 3)}
        embedKey={params.key}
        fullHeight
      />
    </div>
  );
}
