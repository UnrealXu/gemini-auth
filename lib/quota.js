const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CLOUDCODE_BASE_URL = "https://cloudcode-pa.googleapis.com";
const CLIENT_ID = Buffer.from("MTA3MTAwNjA2MDU5MS10bWhzc2luMmgyMWxjcmUyMzV2dG9sb2poNGc0MDNlcC5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbQ==", 'base64').toString('utf8');
const CLIENT_SECRET = Buffer.from("R09DU1BYLUs1OEZXUjQ4NkxkTEoxbUxCOHNYQzR6cURBZg==", 'base64').toString('utf8');

export async function refreshAccessToken(refreshToken) {
  try {
    const cleanToken = refreshToken.split('|')[0];
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: cleanToken,
        grant_type: 'refresh_token'
      })
    });
    
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token;
  } catch (err) {
    return null;
  }
}

export async function fetchProjectId(accessToken) {
  try {
    const res = await fetch(`${CLOUDCODE_BASE_URL}/v1internal:loadCodeAssist`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'antigravity'
      },
      body: JSON.stringify({
        metadata: { ideType: "ANTIGRAVITY", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" }
      })
    });
    
    if (!res.ok) return '';
    const data = await res.json();
    if (data.cloudaicompanionProject) {
      if (typeof data.cloudaicompanionProject === 'string') {
        return data.cloudaicompanionProject;
      } else if (data.cloudaicompanionProject.id) {
        return data.cloudaicompanionProject.id;
      }
    }
    return '';
  } catch (err) {
    return '';
  }
}

export async function fetchQuotaInfo(refreshToken) {
  try {
    const accessToken = await refreshAccessToken(refreshToken);
    if (!accessToken) return null;

    const projectId = await fetchProjectId(accessToken);
    const payload = projectId ? { project: projectId } : {};

    // 1. Fetch Tier / Plan Info
    let plan = 'Free';
    try {
      const assistantRes = await fetch(`${CLOUDCODE_BASE_URL}/v1internal:loadCodeAssist`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'antigravity'
        },
        body: JSON.stringify({
          metadata: { ideType: "ANTIGRAVITY", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" }
        })
      });
      if (assistantRes.ok) {
        const data = await assistantRes.json();
        const tierId = data.currentTier?.id || '';
        if (tierId.includes('free')) plan = 'Free';
        else if (tierId.includes('standard')) plan = 'Standard';
        else if (tierId.includes('pro') || tierId.includes('plus')) plan = 'Pro';
        else plan = data.currentTier?.name || 'Free';
      }
    } catch (err) {}

    // 2. Fetch Quota Summary
    const quotaRes = await fetch(`${CLOUDCODE_BASE_URL}/v1internal:retrieveUserQuotaSummary`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'antigravity'
      },
      body: JSON.stringify(payload)
    });

    if (!quotaRes.ok) return null;
    const data = await quotaRes.json();
    const groups = data.groups || [];

    let gemini_5h = '--%';
    let gemini_weekly = '--%';
    let claude_5h = '--%';
    let claude_weekly = '--%';

    const formatPct = (fraction) => {
      if (fraction === undefined || fraction === null) return '--%';
      return Math.round(fraction * 100) + '%';
    };

    for (const group of groups) {
      const gName = group.displayName || '';
      const buckets = group.buckets || [];
      if (gName.toLowerCase().includes('gemini')) {
        for (const bucket of buckets) {
          if (bucket.window === '5h') {
            gemini_5h = formatPct(bucket.remainingFraction);
          } else if (bucket.window === 'weekly') {
            gemini_weekly = formatPct(bucket.remainingFraction);
          }
        }
      } else if (gName.toLowerCase().includes('claude') || gName.toLowerCase().includes('gpt')) {
        for (const bucket of buckets) {
          if (bucket.window === '5h') {
            claude_5h = formatPct(bucket.remainingFraction);
          } else if (bucket.window === 'weekly') {
            claude_weekly = formatPct(bucket.remainingFraction);
          }
        }
      }
    }

    return {
      plan,
      gemini_5h,
      gemini_weekly,
      claude_5h,
      claude_weekly,
      checked_at: Date.now()
    };
  } catch (err) {
    return null;
  }
}
