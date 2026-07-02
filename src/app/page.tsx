import Link from "next/link";
import { SAMPLE_SLUG } from "@/lib/sample-demo";

export default function Home() {
  return (
    <main className="landing">
      <h1>
        Your front desk, answering <em>24/7</em>.
      </h1>
      <p>
        FrontDesk AI is a white-labeled chat assistant for dentists, HVAC companies, med spas, and
        plumbers. It answers customer questions around the clock and captures after-hours leads —
        so no call goes unanswered.
      </p>
      <div className="actions">
        <Link className="primary" href={`/demo/${SAMPLE_SLUG}`}>
          Try a live demo
        </Link>
        <a className="secondary" href="mailto:hello@frontdesk-ai.example">
          Get in touch
        </a>
      </div>
    </main>
  );
}
