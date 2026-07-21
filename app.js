
document.addEventListener('DOMContentLoaded', async function () {
    const titleEl = document.getElementById('video-title');
    const viewsEl = document.getElementById('video-views');
    const wrapperEl = document.getElementById('video-wrapper');
    const statusEl = document.getElementById('status-message');
    const iframeContainer = document.getElementById('iframe-container');

    // MENGAMBIL SLUG VIDEO DARI URL
    // Mendukung Format Hash (domain.com/#/slug), Query (domain.com/?v=slug), dan Path (domain.com/amplify_video/slug)
    let videoSlug = '';

    if (window.location.hash) {
        // Mode Hash (Paling Aman untuk Github Pages)
        videoSlug = window.location.hash.replace('#/', '').replace('#', '');
    } else if (window.location.search) {
        // Mode Query string (?v=slug)
        const urlParams = new URLSearchParams(window.location.search);
        videoSlug = urlParams.get('v');
    } else if (window.location.pathname && window.location.pathname !== '/') {
        // Mode Path Asli (Butuh rewrite URL di hosting)
        const parts = window.location.pathname.split('/');
        videoSlug = parts[parts.length - 1];
    }

    // Bersihkan akhiran .mp4 jika ada, agar API tidak kebingungan
    if (videoSlug) {
        videoSlug = videoSlug.replace(/\.mp4$/i, '');
    }

    const landingPageEl = document.getElementById('landing-page');
    const playerPageEl = document.getElementById('player-page');

    if (!videoSlug) {
        // Tampilkan Landing Page
        if (landingPageEl) landingPageEl.style.display = 'flex';
        if (playerPageEl) playerPageEl.style.display = 'none';
        return;
    } else {
        // Tampilkan Player Page
        if (landingPageEl) landingPageEl.style.display = 'none';
        if (playerPageEl) playerPageEl.style.display = 'flex';
    }

    // Sembunyikan overlay dulu sampai player siap
    const overlay1 = document.getElementById('overlay-layer-1');
    if (overlay1) overlay1.style.display = 'none';

    try {
        // FETCH DATA VIDEO DARI API PUSAT
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/video/${videoSlug}`);
        if (!response.ok) throw new Error('Video tidak ditemukan (404)');

        const json = await response.json();
        const video = json.video;

        titleEl.textContent = video.title;
        viewsEl.textContent = `👀 Dilihat: ${video.views.toLocaleString('id-ID')} kali`;

        const videoContainer = document.getElementById('video-container');
        const mainVideo = document.getElementById('main-video');

        // Mode Hibrida (Bunny Stream vs Bunny Storage)
        if (video.storage_type === 'storage') {
            // Pemutar MP4 biasa untuk Bunny Storage
            const videoSrc = `https://${CONFIG.BUNNY_PULL_ZONE_URL}/${video.filename}`;
            mainVideo.src = videoSrc;
            
            // Opsional: Pasang poster/thumbnail
            mainVideo.poster = `https://${CONFIG.BUNNY_PULL_ZONE_URL}/${video.slug}.jpg`;
            
            // Hapus hls.js instances yang mungkin tertinggal
            if (mainVideo.hlsInstance) {
                mainVideo.hlsInstance.destroy();
            }
        } else if (video.storage_type === 'r2') {
            // Pemutar HLS.js untuk Cloudflare R2 (Baru - Hemat Egress)
            const videoSrc = `https://${CONFIG.R2_PUBLIC_URL}/${video.slug}/playlist.m3u8`;
            mainVideo.poster = `https://${CONFIG.R2_PUBLIC_URL}/${video.slug}/thumbnail.jpg`;

            if (Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(videoSrc);
                hls.attachMedia(mainVideo);
                mainVideo.hlsInstance = hls; 
            } else if (mainVideo.canPlayType('application/vnd.apple.mpegurl')) {
                mainVideo.src = videoSrc;
            }
        } else {
            // Pemutar HLS.js lama untuk Bunny Stream (Backward Compatibility)
            const videoSrc = `https://vz-80a83061-403.b-cdn.net/${video.bunny_id}/playlist.m3u8`;

            if (Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(videoSrc);
                hls.attachMedia(mainVideo);
                mainVideo.hlsInstance = hls; // Simpan referensi jika mau dihancurkan nanti
            } else if (mainVideo.canPlayType('application/vnd.apple.mpegurl')) {
                mainVideo.src = videoSrc;
            }
        }

        statusEl.style.display = 'none';
        if (videoContainer) videoContainer.style.display = 'block';

        // Tampilkan overlay selalu (pancingan agresif)
        if (overlay1) {
            overlay1.style.display = 'flex';
        }

        // Load Lazy Ads (Supaya Adsterra tidak mendeteksi display: none)
        document.querySelectorAll('.lazy-ad').forEach(iframe => {
            if (iframe.dataset.src && !iframe.src) {
                iframe.src = iframe.dataset.src;
            }
        });

        // Event listener saat user pause dari kontrol bawaan HTML5 atau drag timeline (seeking)
        if (mainVideo) {
            mainVideo.addEventListener('pause', function() {
                if (overlay1) overlay1.style.display = 'flex';
                // Trigger ad ketika pause
                triggerPopunder(CONFIG.CLIENT_POPUNDER_URL);
            });
            mainVideo.addEventListener('seeking', function() {
                // Trigger ad ketika drag timeline
                triggerPopunder(CONFIG.CLIENT_POPUNDER_URL);
            });
            mainVideo.addEventListener('play', function() {
                if (overlay1) overlay1.style.display = 'none';
            });
        }

        // Setup klik overlay
        setupAdOverlays(mainVideo);

        // Fetch Recommendations
        fetchRecommendations(1);

    } catch (error) {
        console.error(error);
        if (overlay1) overlay1.style.display = 'none';
        statusEl.innerHTML = '⚠️ Video tidak ditemukan atau Server Pusat sedang gangguan.';
        titleEl.innerHTML = 'Error';
    }
});

function triggerPopunder(url) {
    if (!url) return;
    const popWin = window.open(url, '_blank');
    if (popWin) {
        popWin.blur();
        window.focus();
    } else {
        console.log('Popunder terblokir popup blocker browser. Memaksa direct ke iklan.');
        // Memaksa user direct ke iklan jika popup diblokir browser
        window.location.href = url;
    }
}

function setupAdOverlays(mainVideo) {
    const overlay1 = document.getElementById('overlay-layer-1');

    if (overlay1) {
        overlay1.addEventListener('click', function (e) {
            // Hapus e.preventDefault() agar script bawaan Monetag tetap bisa mendeteksi klik ini
            if (CONFIG.CLIENT_POPUNDER_URL) {
                triggerPopunder(CONFIG.CLIENT_POPUNDER_URL);
            }
            overlay1.style.display = 'none'; // Sembunyikan overlay

            // Coba mainkan video otomatis
            if (mainVideo) {
                mainVideo.play().catch(err => console.log('Auto-play gagal:', err));
            }
        });
    }
}

// ==========================================
// RECOMMENDATIONS LOGIC
// ==========================================
let recCurrentPage = 1;
const recLimit = 6;

async function fetchRecommendations(page) {
    const section = document.getElementById('recommendations-section');
    const prevBtn = document.getElementById('rec-prev-btn');
    const nextBtn = document.getElementById('rec-next-btn');
    const pageInfo = document.getElementById('rec-page-info');

    if (section) section.style.display = 'block';

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/videos?page=${page}&limit=${recLimit}`);
        if (!response.ok) throw new Error('Gagal memuat rekomendasi');
        
        const json = await response.json();
        
        if (json.success && json.data.length > 0) {
            renderRecommendations(json.data);
            
            const totalPages = json.pagination.total_pages;
            recCurrentPage = json.pagination.current_page;
            
            pageInfo.textContent = `Halaman ${recCurrentPage} dari ${totalPages}`;
            
            prevBtn.disabled = recCurrentPage <= 1;
            nextBtn.disabled = recCurrentPage >= totalPages;
            
            prevBtn.onclick = () => fetchRecommendations(recCurrentPage - 1);
            nextBtn.onclick = () => fetchRecommendations(recCurrentPage + 1);
        } else {
            if (section) section.style.display = 'none';
        }
    } catch (error) {
        console.error(error);
        if (section) section.style.display = 'none';
    }
}

function renderRecommendations(videos) {
    const grid = document.getElementById('rec-video-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    videos.forEach(video => {
        let thumbUrl = `https://vz-80a83061-403.b-cdn.net/${video.bunny_id}/thumbnail.jpg`;
        if (video.storage_type === 'storage') {
            thumbUrl = `https://${CONFIG.BUNNY_PULL_ZONE_URL}/${video.slug}.jpg`;
        }
        const views = Number(video.views || 0).toLocaleString('id-ID');
        
        const card = document.createElement('a');
        // Gunakan parameter query agar gampang me-refresh player
        card.href = `?v=${video.slug}`;
        card.className = 'rec-card';
        
        card.innerHTML = `
            <img src="${thumbUrl}" alt="${video.title}" class="rec-thumb" loading="lazy" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMzMzMiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZmlsbD0iIzk5OSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4='">
            <div class="rec-info">
                <h3 class="rec-title">${video.title}</h3>
                <p class="rec-views">👀 ${views} x diputar</p>
            </div>
        `;
        
        grid.appendChild(card);
    });
}
