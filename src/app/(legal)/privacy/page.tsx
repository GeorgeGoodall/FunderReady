export const metadata = {
  title: "Privacy Policy — FunderReady",
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-zinc-500">Last updated: March 2026</p>

      <h2>1. Data Controller</h2>
      <p>
        FunderReady (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is the data controller responsible for
        your personal data. If you have any questions about this policy, contact
        us at <a href="mailto:privacy@funderready.com">privacy@funderready.com</a>.
      </p>

      <h2>2. Data We Collect</h2>
      <ul>
        <li>
          <strong>Account data:</strong> email address, name (from Supabase Auth
          or Google OAuth sign-in).
        </li>
        <li>
          <strong>Application data:</strong> answers you write to funding
          application questions, including any supporting text.
        </li>
        <li>
          <strong>Review data:</strong> AI-generated review results, scores, and
          feedback for your applications.
        </li>
        <li>
          <strong>Usage data:</strong> review counts, subscription tier, feature
          usage metrics.
        </li>
        <li>
          <strong>Technical data:</strong> IP address, browser type, error logs
          (collected automatically for service operation).
        </li>
      </ul>

      <h2>3. How We Use Your Data</h2>
      <ul>
        <li>To provide the FunderReady service and process your funding applications through our AI review pipeline.</li>
        <li>
          To improve the quality of our AI review pipeline — we may review application
          data and AI-generated results internally to evaluate and improve review accuracy.
          This data is treated as confidential and is not shared externally.
        </li>
        <li>To manage your account and subscription.</li>
        <li>To monitor and fix errors in the service.</li>
      </ul>

      <h2>4. AI Processing</h2>
      <p>
        When you submit an application for review, the text of your answers is
        sent to Anthropic&apos;s Claude API for AI analysis. The AI review results
        are stored in our database and associated with your account. Anthropic
        processes this data subject to their own{" "}
        <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </a>{" "}
        and{" "}
        <a href="https://www.anthropic.com/legal/aup" target="_blank" rel="noopener noreferrer">
          Usage Policies
        </a>
        .
      </p>

      <h2>5. Third-Party Processors</h2>
      <table>
        <thead>
          <tr>
            <th>Processor</th>
            <th>Purpose</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase</td>
            <td>Database, authentication, file storage</td>
            <td>[verify]</td>
          </tr>
          <tr>
            <td>
              <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer">
                Anthropic
              </a>
            </td>
            <td>AI review of application answers</td>
            <td>US</td>
          </tr>
          <tr>
            <td>Stripe</td>
            <td>Payment processing</td>
            <td>[verify]</td>
          </tr>
          <tr>
            <td>Inngest</td>
            <td>Background job processing</td>
            <td>[verify]</td>
          </tr>
          <tr>
            <td>Sentry</td>
            <td>Error monitoring and diagnostics</td>
            <td>[verify]</td>
          </tr>
          <tr>
            <td>Vercel</td>
            <td>Application hosting</td>
            <td>[verify]</td>
          </tr>
        </tbody>
      </table>

      <h2>6. International Data Transfers</h2>
      <p>
        Some of our third-party processors may store or process your data outside
        the UK. Where this occurs, transfers are protected by Standard Contractual
        Clauses (SCCs) or equivalent safeguards recognised under UK GDPR. Please
        refer to each processor&apos;s privacy policy for details of their data
        transfer mechanisms.
      </p>

      <h2>7. Data Retention</h2>
      <ul>
        <li>
          <strong>Account data:</strong> retained while your account is active,
          deleted within 30 days of account deletion.
        </li>
        <li>
          <strong>Application and review data:</strong> retained while your
          account is active. You may delete individual applications at any time.
        </li>
        <li>
          <strong>Usage and billing data:</strong> retained for up to 7 years
          for legal and accounting purposes.
        </li>
        <li>
          <strong>Error logs:</strong> retained for up to 90 days.
        </li>
      </ul>

      <h2>8. Your Rights (GDPR Articles 15-22)</h2>
      <p>You have the right to:</p>
      <ul>
        <li>
          <strong>Access</strong> your personal data (Article 15).
        </li>
        <li>
          <strong>Rectify</strong> inaccurate data (Article 16).
        </li>
        <li>
          <strong>Erase</strong> your data (&quot;right to be forgotten&quot;) (Article
          17).
        </li>
        <li>
          <strong>Restrict</strong> processing (Article 18).
        </li>
        <li>
          <strong>Data portability</strong> — receive your data in a structured
          format (Article 20).
        </li>
        <li>
          <strong>Object</strong> to processing (Article 21).
        </li>
      </ul>
      <p>
        To exercise these rights, contact{" "}
        <a href="mailto:privacy@funderready.com">privacy@funderready.com</a>. We
        will respond within 30 days.
      </p>

      <h2>9. Cookies</h2>
      <p>
        We use only functional cookies required for authentication (Supabase
        auth session cookies). We do not use analytics, advertising, or tracking
        cookies.
      </p>

      <h2>10. Complaints</h2>
      <p>
        If you are unsatisfied with how we handle your data, you have the right
        to lodge a complaint with the Information Commissioner&apos;s Office (ICO) at{" "}
        <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer">
          ico.org.uk
        </a>
        .
      </p>
    </>
  );
}
