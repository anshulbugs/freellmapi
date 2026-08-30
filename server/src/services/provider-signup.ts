/**
 * Where an operator creates an account and collects an API key, per platform.
 *
 * Deliberately partial. An entry here sends someone to a page where they will
 * paste a credential, so a guessed or stale URL is worse than no link at all —
 * a platform with no verified console URL simply shows no button, and the
 * operator finds it the way they would have anyway.
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
};

/**
 * Look up a platform's signup page.
 *
 * @returns The console URL, or undefined when we have none for that platform.
 */
export function signupUrlFor(platform: string): string | undefined {
  return SIGNUP_URLS[platform];
}
