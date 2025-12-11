#!/usr/bin/env node
// Standalone script for AI webhook service to check expired members
// This runs with read-only database access

const fetch = require('node-fetch');
require('dotenv').config();

class ReadOnlyMembershipChecker {
  constructor() {
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    this.databaseId = process.env.CLOUDFLARE_DATABASE_ID;
    this.webhookUrl = process.env.MEMBERSHIP_WEBHOOK_URL;
    this.apiUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`;
  }

  async queryDatabase(sql) {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql })
      });

      const data = await response.json();
      return data.result?.[0]?.results || [];
    } catch (error) {
      console.error('Database query error:', error);
      return [];
    }
  }

  async checkExpiredMembers() {
    const sql = `
      SELECT email, name, expiry_date 
      FROM members 
      WHERE status = 'active' 
      AND expiry_date IS NOT NULL 
      AND expiry_date < datetime('now')
    `;
    
    const expiredMembers = await this.queryDatabase(sql);
    
    if (expiredMembers.length > 0) {
      await this.validateWithAI(expiredMembers);
    }
    
    return expiredMembers;
  }

  async validateWithAI(members) {
    const prompt = `Validate expired memberships. Current: ${new Date().toISOString()}\n${JSON.stringify(members, null, 2)}\nRespond 'VALID' if all expiry_date < current_time.`;
    
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
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 50
        })
      });

      if (groqResponse.ok) {
        const data = await groqResponse.json();
        const validation = data.choices[0]?.message?.content;
        console.log('✓ AI validation (Groq 70b):', validation?.includes('VALID') ? 'VALID' : 'REVIEW');
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
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.1,
              max_tokens: 50
            })
          });
          
          if (groqFallbackResponse.ok) {
            const data = await groqFallbackResponse.json();
            const validation = data.choices[0]?.message?.content;
            console.log('✓ AI validation (Groq 8b):', validation?.includes('VALID') ? 'VALID' : 'REVIEW');
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
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 50
          })
        });

        if (perplexityResponse.ok) {
          const data = await perplexityResponse.json();
          const validation = data.choices[0]?.message?.content;
          console.log('✓ AI validation (Perplexity):', validation?.includes('VALID') ? 'VALID' : 'REVIEW');
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
            generationConfig: { temperature: 0.1, maxOutputTokens: 50 }
          })
        });

        if (geminiResponse.ok) {
          const data = await geminiResponse.json();
          const validation = data.candidates?.[0]?.content?.parts?.[0]?.text;
          console.log('✓ AI validation (Gemini):', validation?.includes('VALID') ? 'VALID' : 'REVIEW');
          success = true;
        }
      } catch (geminiError) {
        console.log('All AI validation failed, proceeding with database results');
      }
    }
  }

  async sendWebhook(expiredMembers) {
    if (!this.webhookUrl || expiredMembers.length === 0) {
      return false;
    }

    try {
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

      return response.ok;
    } catch (error) {
      console.error('Webhook error:', error);
      return false;
    }
  }

  async run() {
    console.log('AI-powered membership expiry check starting...');
    
    const expiredMembers = await this.checkExpiredMembers();
    console.log(`Found ${expiredMembers.length} expired members`);
    
    if (expiredMembers.length > 0) {
      const success = await this.sendWebhook(expiredMembers);
      console.log(`Webhook sent: ${success ? 'Success' : 'Failed'}`);
    }
  }
}

// Run the checker
const checker = new ReadOnlyMembershipChecker();
checker.run().catch(console.error);