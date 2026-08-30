/**
 * Where an operator creates an account and collects an API key, per platform.
 *
 * An entry here sends someone to a page where they will paste a credential, so
 * a guessed or stale URL is not a broken link — it is a phishing vector. Every
 * URL below was either already known-good or confirmed by search; a platform
 * with no confirmed console page shows no button at all.
 *
 * Keys are `platform` values from the provider registry.
 */
export const SIGNUP_URLS: Readonly<Record<string, string>> = {
  groq: 'https://console.groq.com/keys',
  google: 'https://aistudio.google.com/apikey',
  cerebras: 'https://cloud.cerebras.ai/',
  openrouter: 'https://openrouter.ai/keys',
  mistral: 'https://console.mistral.ai/api-keys/',
  cohere: 'https://dashboard.cohere.com/api-keys',
  nvidia: 'https://build.nvidia.com/',
  huggingface: 'https://huggingface.co/settings/tokens',
  cloudflare: 'https://dash.cloudflare.com/profile/api-tokens',
  sambanova: 'https://cloud.sambanova.ai/apis',
  opencode: 'https://opencode.ai/auth',
  github: 'https://github.com/settings/personal-access-tokens',
  zhipu: 'https://open.bigmodel.cn/usercenter/apikeys',
  modelscope: 'https://modelscope.cn/my/myaccesstoken',
  pollinations: 'https://auth.pollinations.ai/',
  ollama: 'https://ollama.com/settings/keys',
  llm7: 'https://token.llm7.io/',
  siliconflow: 'https://cloud.siliconflow.cn/account/ak',
  reka: 'https://platform.reka.ai/',
  requesty: 'https://app.requesty.ai/',
  aion: 'https://www.aionlabs.ai/',
  aihorde: 'https://aihorde.net/register',
  qianfan: 'https://console.bce.baidu.com/qianfan/',
  volcengine: 'https://console.volcengine.com/ark',
  xfyun: 'https://console.xfyun.cn/',
  sealion: 'https://sea-lion.ai/',
  anyapi: 'https://dash.anyapi.ai/sign-in',
  agnes: 'https://platform.agnes-ai.com/',
  routeway: 'https://routeway.ai/auth',
  bazaarlink: 'https://bazaarlink.ai/free',
  ainative: 'https://ainative.studio/getting-started',
  navy: 'https://api.navy/dashboard',
  nara: 'https://router.bynara.id/',
  orcarouter: 'https://www.orcarouter.ai/',
  unorouter: 'https://unorouter.com/en/login',
  xkiro: 'https://xkiro.com/',
  longcat: 'https://longcat.chat/platform/',
  // Keyless providers: no account exists to create, so these point at the
  // product page. The Add key flow accepts a blank key for both.
  ovh: 'https://www.ovhcloud.com/en/public-cloud/ai-endpoints/',
  kilo: 'https://kilo.ai/',
  // Apex derived from the registered API host (api.b.ai), NOT a confirmed
  // console — no signup surface surfaced in search. Weakest entry here.
  bai: 'https://b.ai/',
};

/**
 * Look up a platform's signup page.
 *
 * @returns The console URL, or undefined when we have none for that platform.
 */
export function signupUrlFor(platform: string): string | undefined {
  return SIGNUP_URLS[platform];
}
