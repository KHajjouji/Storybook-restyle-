import fetch from 'node-fetch';
fetch('http://localhost:3000/api/gemini/v1alpha/models/gemini-3.1-flash-preview:generateContent', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    contents: [{ parts: [{ text: "Hello, reply with Ping." }] }]
  })
}).then(res => res.text()).then(text => console.log('RESPONSE:', text)).catch(console.error);
