const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined

export function hasApiKey(): boolean {
  return !!API_KEY
}

export async function explainError(
  fieldLabel: string,
  value: string,
  errorMessage: string,
): Promise<string> {
  if (!API_KEY) throw new Error('API key not configured')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Поле формы: ${fieldLabel}
Введённое значение: ${value}
Ошибка валидации: ${errorMessage}

Объясни на русском языке без технического жаргона:
1. Что именно не так с этим значением
2. Почему это важно по банковскому стандарту
3. Как это исправить

Ответь кратко, 3–4 предложения.`,
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`Ошибка API: ${response.status}`)
  }

  const data = await response.json() as { content: Array<{ text: string }> }
  return data.content[0].text
}
