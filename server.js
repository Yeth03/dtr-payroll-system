require('dotenv').config();

const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// SUPABASE CONFIGURATION
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let supabase = null;
if (supabaseConfigured) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

// MIDDLEWARE FOR CHECKING SUPABASE CONNECTION
const requireSupabase = (req, res, next) => {
  if (!supabaseConfigured) {
    return res.status(503).json({
      ok: false,
      error: 'Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env before saving DTR records.'
    });
  }

  next();
};

// BODY PARSER MIDDLEWARE
app.use(express.json());

// STATIC FILES MIDDLEWARE (Dito isineserve ang style.css, kali.jpg, at iba pang static files)
app.use(express.static(path.join(__dirname)));

// HEALTH CHECK API
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'dtr-server',
    supabaseConfigured,
    port: PORT
  });
});

// GET DTR RECORDS
app.get('/api/dtr', requireSupabase, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('dtr_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }

    res.json({ ok: true, data: data || [] });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// CREATE DTR RECORD
app.post('/api/dtr', requireSupabase, async (req, res) => {
  try {
    const { name, type, created_at } = req.body || {};

    if (!name || !type) {
      return res.status(400).json({ ok: false, error: 'name and type are required.' });
    }

    const { data, error } = await supabase
      .from('dtr_logs')
      .insert([
        {
          name,
          type,
          created_at: created_at || new Date().toISOString()
        }
      ])
      .select();

    if (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }

    res.status(201).json({ ok: true, data: data || [] });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// DELETE DTR RECORD
app.delete('/api/dtr/:id', requireSupabase, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('dtr_logs')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }

    res.json({ ok: true, deletedId: id });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// FALLBACK ROUTE FOR FRONTEND (SPA ROUTING)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, message: 'Endpoint not found.' });
  }

  res.sendFile(path.join(__dirname, 'index.html'));
});

// START SERVER
app.listen(PORT, () => {
  console.log(`DTR app running at http://localhost:${PORT}`);
});