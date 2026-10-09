const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();

// Habilita CORS para permitir que seu site consulte esta API
app.use(cors());

// Variáveis vindas do ambiente
const API_KEY = process.env.GUTHRIE_API_KEY;
const API_URL = 'https://guthrieai-platform.onrender.com/api/export/submitted-projects?view=client';

// Cache em memória para o site carregar instantaneamente
let cachedData = null;
let lastFetchTime = 0;
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 horas

app.get('/api/guthrie-projects', async (req, res) => {
  const now = Date.now();

  // Retorna do cache se tiver menos de 12 horas
  if (cachedData && (now - lastFetchTime < CACHE_DURATION)) {
    return res.json(cachedData);
  }

  try {
    // Controller para timeout de 90 segundos (Render sleep fix)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Erro na API de origem: Status ${response.status}`);
    }

    const data = await response.json();

    // Agrupa os projetos por cidade/estado
    const aggregated = {};

    if (data.rows && Array.isArray(data.rows)) {
      data.rows.forEach(row => {
        if (row.client_city && row.client_state) {
          const locationKey = `${row.client_city}, ${row.client_state}`;
          const count = row.submitted_projects || 1;

          if (!aggregated[locationKey]) {
            aggregated[locationKey] = 0;
          }
          aggregated[locationKey] += count;
        }
      });
    }

    const result = Object.keys(aggregated).map(location => ({
      location: location,
      count: aggregated[location]
    }));

    // Atualiza o cache
    cachedData = result;
    lastFetchTime = now;

    res.json(result);

  } catch (error) {
    console.error('Erro ao buscar dados no GuthrieAI:', error);

    // Se a Render falhar/timeout, usa o último cache salvo se existir
    if (cachedData) {
      return res.json(cachedData);
    }

    res.status(500).json({ error: 'Falha ao conectar com o servidor do GuthrieAI.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});