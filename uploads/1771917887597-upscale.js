const express = require('express');
const router = express.Router();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');

/**
 * Konfigurasi Multer
 * Menggunakan folder /tmp karena Vercel bersifat Read-Only
 */
const upload = multer({ dest: os.tmpdir() });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * CORE LOGIC - iLoveIMG Upscaler
 * Author: RANZZ
 */
async function upscaleImage(filePath) {
    try {
        // 1. Inisialisasi Task & Token
        const initialRes = await axios.get('https://www.iloveimg.com/id/tingkatkan-gambar', {
            headers: { 'User-Agent': UA }
        });
        const html = initialRes.data;
        const token = html.match(/"token":"([^"]+)"/)?.[1];
        const taskId = html.match(/ilovepdfConfig\.taskId\s*=\s*'([^']+)'/)?.[1];

        if (!token || !taskId) throw new Error('Gagal mendapatkan session iLoveIMG');

        // 2. Upload Binary File
        const fileName = path.basename(filePath);
        const uploadForm = new FormData();
        uploadForm.append('name', fileName);
        uploadForm.append('chunk', '0');
        uploadForm.append('chunks', '1');
        uploadForm.append('task', taskId);
        uploadForm.append('preview', '1');
        uploadForm.append('v', 'web.0');
        uploadForm.append('file', fs.createReadStream(filePath));

        const uploadRes = await axios.post('https://api1g.iloveimg.com/v1/upload', uploadForm, {
            headers: {
                ...uploadForm.getHeaders(),
                'Authorization': `Bearer ${token}`,
                'User-Agent': UA
            }
        });

        const serverFilename = uploadRes.data.server_filename;

        // 3. Eksekusi Proses Upscale
        const processForm = new FormData();
        processForm.append('packaged_filename', 'ranzz_hd');
        processForm.append('multiplier', '2'); // Opsi: 2 atau 4
        processForm.append('task', taskId);
        processForm.append('tool', 'upscaleimage');
        processForm.append('files[0][server_filename]', serverFilename);
        processForm.append('files[0][filename]', fileName);

        const processRes = await axios.post('https://api1g.iloveimg.com/v1/process', processForm, {
            headers: {
                ...processForm.getHeaders(),
                'Authorization': `Bearer ${token}`,
                'User-Agent': UA,
                'Origin': 'https://www.iloveimg.com'
            }
        });

        if (processRes.data.status !== 'TaskSuccess') throw new Error('Proses gagal di server iLoveIMG');

        return {
            status: true,
            job_id: taskId,
            download_url: `https://api1g.iloveimg.com/v1/download/${taskId}`,
            output_name: processRes.data.download_filename
        };
    } catch (e) {
        throw new Error(e.message);
    }
}

/**
 * ROUTER - Endpoint khusus POST Multipart
 * Field name: "image"
 */
router.post('/', upload.single('image'), async (req, res) => {
    // Validasi keberadaan file
    if (!req.file) {
        return res.status(400).json({
            status: false,
            creator: "RANZZ",
            error: "Request body harus berupa multipart/form-data dengan field 'image'."
        });
    }

    const filePath = req.file.path;

    try {
        const result = await upscaleImage(filePath);

        // Hapus file dari /tmp setelah selesai
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        return res.json({
            status: true,
            creator: "RANZZ",
            result: result
        });

    } catch (e) {
        // Pastikan cleanup tetap jalan jika error
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        
        console.error("Upscale Error:", e.message);
        return res.status(500).json({
            status: false,
            creator: "RANZZ",
            error: e.message
        });
    }
});

module.exports = router;
