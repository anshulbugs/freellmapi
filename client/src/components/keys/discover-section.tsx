import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, ShieldCheck, ShieldAlert, TriangleAlert } from 'lucide-react'
import { useI18n } from '@/i18n'
import { discoverVerdict, type VerificationReport } from '@/lib/discover-verdict'

interface Candidate {
  id: string
  name: string
  signupUrl: string
  baseUrl: string
  docsUrl?: string
  authMode: 'bearer' | 'keyless'
  notes?: string
}

interface VerifyResponse {
  candidate: { id: string; name: string; baseUrl: string }
  report: VerificationReport
}

function CandidateRow({ candidate }: { candidate: Candidate }) {
  const { t } = useI18n()
  const [apiKey, setApiKey] = useState('')
  const [result, setResult] = useState<VerificationReport | null>(null)

  const verify = useMutation({
    mutationFn: () =>
      apiFetch<VerifyResponse>(`/api/keys/candidates/${encodeURIComponent(candidate.id)}/verify`, {
        method: 'POST',
        body: JSON.stringify({ apiKey }),
      }),
    onSuccess: data => setResult(data.report),
    onError: (err: Error) => toast.error(err.message),
  })

  const verdict = result ? discoverVerdict(result) : null

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{candidate.name}</span>
            {candidate.authMode === 'keyless' && (
              <Badge variant="secondary">{t('keys.discoverKeyless')}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{candidate.baseUrl}</p>
          {candidate.notes && (
            <p className="text-sm text-muted-foreground mt-1">{candidate.notes}</p>
          )}
        </div>

        {/* Opens the provider's own signup page in a new tab. noopener is not
            optional here: without it the opened page can retarget this one via
            window.opener, and this tab holds a dashboard session. */}
        <a
          href={candidate.signupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
        >
          {t('keys.discoverSignUp')}
          <ExternalLink className="size-3.5" />
        </a>
      </div>

      <div className="flex items-center gap-2">
        {candidate.authMode === 'bearer' && (
          <Input
            type="password"
            value={apiKey}
            onChange={event => setApiKey(event.target.value)}
            placeholder={t('keys.discoverKeyPlaceholder')}
            autoComplete="off"
          />
        )}
        <Button
          onClick={() => verify.mutate()}
          disabled={verify.isPending || (candidate.authMode === 'bearer' && !apiKey.trim())}
        >
          {verify.isPending ? t('keys.discoverTesting') : t('keys.discoverTest')}
        </Button>
      </div>

      {verdict && (
        <div
          className={
            verdict.tone === 'ok'
              ? 'flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400'
              : verdict.tone === 'warn'
                ? 'flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400'
                : 'flex items-center gap-2 text-sm text-destructive'
          }
        >
          {verdict.tone === 'ok' && <ShieldCheck className="size-4 shrink-0" />}
          {verdict.tone === 'warn' && <TriangleAlert className="size-4 shrink-0" />}
          {verdict.tone === 'blocked' && <ShieldAlert className="size-4 shrink-0" />}
          <span>{t(verdict.messageKey)}</span>
        </div>
      )}
    </div>
  )
}

export function DiscoverSection() {
  const { t } = useI18n()
  const { data, isLoading } = useQuery({
    queryKey: ['provider-candidates'],
    queryFn: () => apiFetch<{ candidates: Candidate[] }>('/api/keys/candidates'),
  })

  if (isLoading) return null

  const candidates = data?.candidates ?? []

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('keys.discoverIntro')}</p>

      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('keys.discoverEmpty')}</p>
      ) : (
        <div className="space-y-3">
          {candidates.map(candidate => (
            <CandidateRow key={candidate.id} candidate={candidate} />
          ))}
        </div>
      )}
    </div>
  )
}
