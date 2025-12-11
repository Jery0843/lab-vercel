// Read-only AI service for checking expired members
import { getDatabase } from './db';

interface ExpiredMember {
  email: string;
  name?: string;
  expiry_date: string;
}

export class MembershipChecker {
  private db: any;
  private webhookUrl: string;

  constructor(webhookUrl?: string) {
    this.db = getDatabase();
    this.webhookUrl = webhookUrl || process.env.MEMBERSHIP_WEBHOOK_URL || '';
  }

  // Read-only method to check for expired members with AI validation
  async checkExpiredMembers(): Promise<ExpiredMember[]> {
    if (!this.db) {
      console.error('Database not available');
      return [];
    }

    try {
      const query = `
        SELECT email, name, expiry_date 
        FROM members 
        WHERE status = 'active' 
        AND expiry_date IS NOT NULL 
        AND expiry_date != '' 
        AND LENGTH(expiry_date) > 0
        AND expiry_date < datetime('now')
      `;
      
      const prepared = await this.db.prepare(query);
      const expiredMembers = await prepared.all();
      
      console.log(`📊 Found ${expiredMembers.length} expired members`);
      
      // Log member details for AI validation
      if (expiredMembers.length > 0) {
        console.log('📋 Member details:');
        expiredMembers.forEach((member: ExpiredMember) => {
          console.log(`  - ${member.email}: expired ${member.expiry_date}`);
        });
      }
      
      if (expiredMembers.length > 0) {
        const validatedMembers = await this.validateWithAI(expiredMembers);
        return validatedMembers;
      }
      
      return expiredMembers || [];
    } catch (error) {
      console.error('Error checking expired members:', error);
      return [];
    }
  }

  // AI validation with fallbacks - returns only valid expired members
  private async validateWithAI(members: ExpiredMember[]): Promise<ExpiredMember[]> {
    const currentTime = new Date().toISOString();
    console.log('🕐 Server time being sent to AI:', currentTime);
    console.log('📅 Member expiry:', members[0]?.expiry_date);
    
    // AI validation enabled
    console.log('🤖 AI validation enabled - checking expiry logic');
    
    const prompt = `Check if membership is expired:

Current: ${currentTime}
Expiry: ${members[0]?.expiry_date}

Is expiry date before current time? Respond VALID if yes, INVALID if no.`;
    
    let success = false;
    
    // Try Groq primary
    try {
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are a precise membership validator. Only respond with "VALID" or "INVALID".'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.0,
          max_tokens: 10
        })
      });

      if (groqResponse.ok) {
        const data = await groqResponse.json();
        const validation = data.choices[0]?.message?.content?.trim().toUpperCase();
        console.log('🤖 AI Response (Groq 70b):', validation);
        if (validation === 'VALID') {
          console.log('✓ AI validation (Groq 70b): ✅ VALID - All members approved');
          return members;
        } else {
          console.log('✓ AI validation (Groq 70b): ⚠️ INVALID - Blocking processing');
          return [];
        }
        success = true;
      } else {
        const errorData = await groqResponse.json();
        if (errorData.error?.code === 'rate_limit_exceeded') {
          console.log('Groq rate limit, trying fallback model...');
          const groqFallbackResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'llama-3.1-8b-instant',
              messages: [
                {
                  role: 'system',
                  content: 'You are a precise membership validator. Only respond with "VALID" or "INVALID".'
                },
                {
                  role: 'user',
                  content: prompt
                }
              ],
              temperature: 0.0,
              max_tokens: 10
            })
          });
          
          if (groqFallbackResponse.ok) {
            const data = await groqFallbackResponse.json();
            const validation = data.choices[0]?.message?.content?.trim().toUpperCase();
            console.log('🤖 AI Response (Groq 8b):', validation);
            if (validation === 'VALID') {
              console.log('✓ AI validation (Groq 8b): ✅ VALID - All members approved');
              return members;
            } else {
              console.log('✓ AI validation (Groq 8b): ⚠️ INVALID - Blocking processing');
              return [];
            }
            success = true;
          }
        }
      }
    } catch (groqError) {
      console.log('Groq failed, trying Perplexity...');
    }

    if (!success) {
      // Try Perplexity fallback
      try {
        const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'sonar',
            messages: [
              {
                role: 'system',
                content: 'You are a precise membership validator. Only respond with "VALID" or "INVALID".'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.0,
            max_tokens: 10
          })
        });

        if (perplexityResponse.ok) {
          const data = await perplexityResponse.json();
          const validation = data.choices[0]?.message?.content?.trim().toUpperCase();
          console.log('🤖 AI Response (Perplexity):', validation);
          if (validation === 'VALID') {
            console.log('✓ AI validation (Perplexity): ✅ VALID - All members approved');
            return members;
          } else {
            console.log('✓ AI validation (Perplexity): ⚠️ INVALID - Blocking processing');
            return [];
          }
          success = true;
        }
      } catch (perplexityError) {
        console.log('Perplexity failed, trying Gemini...');
      }
    }

    if (!success) {
      // Try Gemini fallback
      try {
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${process.env.GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { 
              temperature: 0.0, 
              maxOutputTokens: 10,
              candidateCount: 1
            }
          })
        });

        if (geminiResponse.ok) {
          const data = await geminiResponse.json();
          const validation = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase();
          console.log('🤖 AI Response (Gemini):', validation);
          if (validation === 'VALID') {
            console.log('✓ AI validation (Gemini): ✅ VALID - All members approved');
            return members;
          } else {
            console.log('✓ AI validation (Gemini): ⚠️ INVALID - Blocking processing');
            return [];
          }
          success = true;
        }
      } catch (geminiError) {
        console.log('❌ All AI validation failed, proceeding with database results');
        return members; // Fallback to database results if AI fails
      }
    }
    
    // Final fallback if no success flag was set
    return members;
  }

  // Send webhook notification for expired members
  async notifyExpiredMembers(expiredMembers: ExpiredMember[]): Promise<boolean> {
    if (!this.webhookUrl || expiredMembers.length === 0) {
      console.log('⚠️ No webhook URL or no expired members to process');
      return false;
    }

    try {
      console.log(`🔄 Sending webhook to: ${this.webhookUrl}`);
      console.log(`📧 Processing ${expiredMembers.length} expired members`);
      
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.WEBHOOK_SECRET || 'default-secret'}`
        },
        body: JSON.stringify({
          type: 'membership_expired',
          expired_members: expiredMembers,
          timestamp: new Date().toISOString()
        })
      });

      console.log(`📡 Webhook response status: ${response.status}`);
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Webhook successful:', result);
        return true;
      } else {
        const errorText = await response.text();
        console.error('❌ Webhook failed:', response.status, errorText);
        return false;
      }
    } catch (error) {
      console.error('❌ Error sending webhook:', error);
      return false;
    }
  }

  // Main method to check and notify
  async processExpiredMembers(): Promise<void> {
    const expiredMembers = await this.checkExpiredMembers();
    
    if (expiredMembers.length > 0) {
      console.log(`Processing ${expiredMembers.length} expired members`);
      console.log(`🔗 Webhook URL: ${this.webhookUrl}`);
      
      const webhookResult = await this.notifyExpiredMembers(expiredMembers);
      console.log(`📊 Webhook result: ${webhookResult}`);
      
      if (webhookResult) {
        console.log('✅ All expired members processed successfully');
      } else {
        console.log('❌ Webhook notification failed');
      }
    } else {
      console.log('📊 No expired members found to process');
    }
  }
}