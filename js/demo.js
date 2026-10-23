/**
 * js/demo.js
 * 대한민국 인프라 소외지역 실시간 분석 지도 - TTS 자동 시연(Auto Demo) 모듈
 * + TTS 음성 해설(Web Speech API) / 하단 자막 지원
 *   - 각 단계의 '화면 동작'과 '음성 해설'이 모두 끝나야 다음 단계로 넘어갑니다.
 *   - 음성 켜기/끄기, 속도 조절 가능 (음성 미지원 브라우저는 자막만 표시)
 *   - Chrome 15초 음성 끊김 방지(keepAlive) 탑재
 * 
 * 시연 시나리오:
 *  1. 전국 베이스맵 & 인프라 격차 진단 패널
 *  2. 사용방법 안내 팝업 (11장 전체 낭독 후 자동 닫힘)
 *  3. 실시간 행정구역 검색 (강원 속초시 26km 버퍼 원 & 팝업)
 *  4. 초고위험 소외지역 심층 분석 (경북 의성군)
 *  5. 전문 인프라 레이어 다중 투사 (분만공백, 교통단절, 에너지소외)
 *  6. 13대 인프라 카테고리 필터링
 *  7. 지도 핀 숨기기 / 표시하기 토글
 *  8. 마커 클러스터링
 *  9. 좌측 패널 접기 / 펼치기
 * 10. 실시간 동기화 상태 바 & 타이머
 * 11. 시연 완료 및 초기화 (원위치 복원)
 *
 * 단계(step) 구조:
 *   title      : 위젯에 표시되는 단계명
 *   narration  : 낭독할 문장 (한 덩어리일 때)
 *   segments   : 문장 묶음 배열 [{ text, before, delay, caption }]
 *                - 각 문장이 시작될 때 before() 가 실행되어 '말하는 내용'과 '화면 동작'이 맞물립니다.
 *   action     : 단계 시작 시 실행할 화면 동작 (끝나면 next() 호출)
 *   after      : 단계가 끝날 때(다음 단계로 넘어가기 직전) 실행 — 팝업 닫기 등
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════
  // 지도/UI 제어 헬퍼 — 상태를 '설정'하는 방식이라 여러 번 호출해도 안전합니다
  // ═══════════════════════════════════════════
  function getMap() { return (typeof map !== 'undefined') ? map : null; }

  function flyToView(latlng, zoom, duration) {
    const m = getMap();
    if (m) m.flyTo(latlng, zoom, { duration: duration || 1.2 });
  }

  function closeMapPopup() {
    const m = getMap();
    if (m) m.closePopup();
  }

  function setOverlay(key, on) {
    const m = getMap();
    if (!m || typeof overlayLayerMap === 'undefined' || typeof toggleOverlayLayer !== 'function') return;
    const layer = overlayLayerMap[key];
    if (layer && m.hasLayer(layer) !== on) toggleOverlayLayer(key);
  }

  function setInfra(key, on) {
    if (typeof activeInfraFilterKeys === 'undefined' || typeof toggleInfraOnMap !== 'function') return;
    if (activeInfraFilterKeys.has(key) !== on) toggleInfraOnMap(key);
  }

  function setPins(visible) {
    if (typeof areCategoryPinsVisible === 'undefined' || typeof toggleCategoryPins !== 'function') return;
    if (areCategoryPinsVisible !== visible) toggleCategoryPins();
  }

  function setPanelCollapsed(collapsed) {
    const panel = document.getElementById('categoryItemSidebar');
    if (!panel || typeof toggleSidebarPanel !== 'function') return;
    if (panel.classList.contains('collapsed') !== collapsed) toggleSidebarPanel();
  }

  function closeAllPopups() {
    if (typeof closeSearchAlert === 'function') closeSearchAlert();
    if (typeof closeTutorial === 'function') closeTutorial();
  }

  // 설명 중인 UI 요소 강조 (주황 테두리)
  let hlEl = null;
  function clearHl() {
    if (hlEl) {
      hlEl.style.outline = '';
      hlEl.style.outlineOffset = '';
      hlEl.style.boxShadow = '';
      hlEl = null;
    }
  }
  function hl(selector) {
    clearHl();
    const el = selector ? document.querySelector(selector) : null;
    if (!el) return;
    hlEl = el;
    el.style.outline = '3px solid #ff9500';
    el.style.outlineOffset = '2px';
    el.style.boxShadow = '0 0 0 6px rgba(255, 149, 0, 0.25)';
    if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function stripHtml(html) {
    return String(html || '')
      .replace(/<br\s*\/?>/gi, '. ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/[•◀▶]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function inspectUiseong() {
    if (typeof allRegionsComprehensiveData !== 'undefined') {
      const idx = allRegionsComprehensiveData.findIndex(r => r.name.includes('의성'));
      if (idx !== -1 && typeof selectAndInspectRegion === 'function') {
        selectAndInspectRegion(idx, true);
        return;
      }
    }
    const input = document.getElementById('searchInput');
    if (input) input.value = '경북 의성군';
    if (typeof executeSearchButton === 'function') executeSearchButton();
  }

  // ═══════════════════════════════════════════
  // 📖 튜토리얼 자동 TTS 세그먼트 빌더
  //    TUTORIAL_STEPS 배열을 순회하며 각 슬라이드를
  //    음성 낭독 + 자동 페이지 넘김 세그먼트로 변환
  // ═══════════════════════════════════════════
  function buildTutorialSegments() {
    if (typeof TUTORIAL_STEPS === 'undefined' || !TUTORIAL_STEPS.length) {
      return [{ text: '사용방법 안내를 표시합니다.' }];
    }

    const segs = [];
    const total = TUTORIAL_STEPS.length;

    TUTORIAL_STEPS.forEach((step, idx) => {
      // HTML에서 순수 텍스트 추출하여 TTS 낭독용 텍스트 생성
      const plainTitle = stripHtml(step.title);
      const plainDesc = stripHtml(step.desc);
      const narText = `${idx + 1}단계. ${plainTitle}. ${plainDesc}`;

      segs.push({
        text: narText,
        delay: idx === 0 ? 300 : 200,
        before: () => {
          // 튜토리얼 모달이 열려 있으면 해당 스텝으로 이동
          if (typeof tutorialCurrentStep !== 'undefined') {
            tutorialCurrentStep = idx;
            if (typeof renderTutorialStep === 'function') renderTutorialStep();
          }
        }
      });
    });

    return segs;
  }

  // ═══════════════════════════════════════════
  // ✨ Google Gemini AI 아나운서 시연 시나리오 단계 정의
  // ═══════════════════════════════════════════
  const demoSteps = [
    {
      title: "1. 전국 베이스맵 & Gemini 진단 패널",
      narration: "안녕하십니까. 구글 제미나이 AI가 진행하는 대한민국 인프라 소외지역 실시간 정밀 분석 시연에 오신 것을 환영합니다. 본 플랫폼은 전국 열여덟 개 핵심 인프라 데이터를 실시간으로 통합 분석하여 지역 간 격차를 지도 위에 시각화합니다. 현재 수도권과 지방 간 응급실 도달시간은 무려 일곱 배 이상 벌어져 있습니다. 먼저 주요 사용 안내부터 살펴보겠습니다.",
      action: (next) => {
        closeAllPopups();
        closeMapPopup();
        flyToView([36.2, 127.8], 7.1, 1.2);
        setTimeout(next, 1500);
      }
    },
    {
      title: "2. 사용방법 안내 팝업",
      segments: buildTutorialSegments,
      narration: "제미나이 튜토리얼 가이드입니다. 열 가지 핵심 조작법을 통해 초고화질 위성 지도 조작과 레이어 분석을 확인하실 수 있습니다.",
      action: (next) => {
        if (typeof openTutorial === 'function') openTutorial();
        setTimeout(next, 600);
      },
      after: () => { if (typeof closeTutorial === 'function') closeTutorial(); }
    },
    {
      title: "3. 행정구역 스마트 검색 (강원 속초시)",
      segments: [
        {
          text: "첫 번째 핵심 기능인 행정구역 스마트 검색입니다. 검색창에 속초시를 입력하면 지능형 자동완성 목록이 즉시 표출됩니다.",
          before: () => {
            const input = document.getElementById('searchInput');
            if (input) {
              input.value = "속초시";
              input.focus();
              if (typeof handleSearchInput === 'function') handleSearchInput({ target: input });
            }
          }
        },
        {
          text: "검색을 실행하면 해당 지역으로 카메라가 즉각 이동하며, 반경 이십육 킬로미터 집중 분석 구역이 푸른 버퍼 원으로 투사됩니다. 핀을 클릭하면 종합 인프라 진단 리포트가 열립니다.",
          before: () => { if (typeof executeSearchButton === 'function') executeSearchButton(); }
        }
      ],
      action: (next) => next()
    },
    {
      title: "4. 초고위험 소외지역 심층 분석 (경북 의성군)",
      segments: [
        {
          text: "다음은 지방소멸위험지수 전국 최고 위험군인 경상북도 의성군입니다.",
          before: inspectUiseong
        },
        {
          text: "지역을 선택하면 좌측 패널에 제미나이 실시간 진단 카드가 활성화되고, 현장 인프라 결손 수치가 지도에 정밀 매핑됩니다."
        },
        {
          text: "야간 운영 약국 영 곳, 초중고 누적 폐교 서른다섯 곳, 시중은행 지점 철수 등 중첩된 인프라 위기가 확인됩니다. 제미나이 AI 모델은 이웃사촌 시범마을과 청년 거점 인프라 구축을 해결책으로 제시합니다."
        }
      ],
      action: (next) => next()
    },
    {
      title: "5. 전문 인프라 다중 레이어 투사",
      segments: [
        {
          text: "전문 인프라 레이어 다중 투사 기능입니다. 먼저 분만실이 전무한 분만공백 레이어를 활성화합니다.",
          before: () => setOverlay('maternal', true)
        },
        {
          text: "이어서 대중교통 접근이 단절된 교통단절 레이어를 중첩합니다.",
          before: () => setOverlay('transit', true)
        },
        {
          text: "도시가스와 상수도가 미보급된 에너지소외 레이어를 켭니다.",
          before: () => setOverlay('energy', true)
        },
        {
          text: "이처럼 레이어를 다층 중첩하면, 의료와 교통, 에너지가 동시에 고립된 복합 소외 사각지대를 한눈에 식별할 수 있습니다."
        }
      ],
      action: (next) => {
        closeMapPopup();
        flyToView([36.0, 128.2], 8.2, 1.0);
        setTimeout(next, 1000);
      }
    },
    {
      title: "6. 13대 인프라 카테고리 필터링",
      segments: [
        {
          text: "열세 개 인프라 카테고리 필터입니다. 응급의료 버튼을 누르면 해당 분야의 취약 지역만 이모지 핀으로 지도에 선별 표출됩니다.",
          before: () => setInfra('🚨 응급의료', true)
        },
        {
          text: "필터를 교통과 철도로 전환하여 각 인프라별 결손 분포를 상호 비교 진단합니다.",
          before: () => { setInfra('🚨 응급의료', false); setInfra('🚆 교통/철도', true); }
        },
        {
          text: "필터를 해제하면 전체 인프라 핀이 자연스럽게 복원됩니다.",
          before: () => setInfra('🚆 교통/철도', false)
        }
      ],
      action: (next) => next()
    },
    {
      title: "7. 지도 핀 숨김 / 표시 토글",
      segments: [
        {
          text: "시각적 피로도를 낮추는 핀 숨김 토글입니다. 지형과 도로망을 넓게 분석할 때 유용합니다.",
          before: () => setPins(false)
        },
        {
          text: "다시 핀 표시를 선택하면 모든 인프라 마커가 원위치로 복원됩니다.",
          before: () => setPins(true)
        }
      ],
      action: (next) => next()
    },
    {
      title: "8. 지능형 마커 클러스터링",
      narration: "지능형 마커 클러스터링입니다. 광역 뷰에서는 밀집된 핀들이 파랑, 주황, 빨강 배지로 자동 그룹화되어 핀 겹침 현상을 완벽히 방지하며, 확대 시 개별 핀으로 부드럽게 펼쳐집니다.",
      action: (next) => {
        closeMapPopup();
        flyToView([36.3, 127.8], 7.0, 1.2);
        setTimeout(next, 1500);
      }
    },
    {
      title: "9. 인터랙티브 패널 접기 / 펼치기",
      segments: [
        {
          text: "좌측 패널은 플로팅 핸들을 통해 손쉽게 접고 펼 수 있습니다. 패널을 접으면 와이드 화면에서 지도를 감상할 수 있습니다.",
          before: () => setPanelCollapsed(true)
        },
        {
          text: "패널을 다시 펼치면 열세 대 인프라 진단 카드와 항목 목록을 정밀 대조할 수 있습니다.",
          before: () => setPanelCollapsed(false)
        }
      ],
      action: (next) => next()
    },
    {
      title: "10. 실시간 동기화 상태 바 & 타이머",
      segments: [
        {
          text: "상단의 라이브 스트림 바입니다. 전국 열여덟 개 인프라 데이터가 십 분 주기로 끊김 없이 실시간 동기화되고 있음을 보여줍니다.",
          before: () => hl('.sync-status-bar')
        }
      ],
      action: (next) => next(),
      after: clearHl
    },
    {
      title: "11. 시연 완료 및 초기화",
      narration: "이상으로 구글 제미나이 AI와 함께한 인프라 소외지역 시연을 마칩니다. 화면은 초기 상태로 안전하게 복원됩니다. 상단의 제미나이 AI 도슨트 버튼으로 개별 지역의 심층 브리핑도 직접 체험해 보세요. 경청해 주셔서 감사합니다.",
      action: (next) => {
        cleanupDemoState();
        setTimeout(next, 1500);
      }
    }
  ];

  // 시연 상태 정리 및 원위치 복원 함수
  function cleanupDemoState() {
    clearHl();

    // 1. 열린 팝업 모두 닫기
    closeAllPopups();
    closeMapPopup();

    // 2. 인프라 버튼 필터 해제
    if (typeof activeInfraFilterKeys !== 'undefined' && activeInfraFilterKeys.size > 0) {
      Array.from(activeInfraFilterKeys).forEach(k => setInfra(k, false));
    }

    // 3. 지도 핀 표시 복원
    setPins(true);

    // 4. 시연 중 켠 오버레이 레이어 끄기
    ['maternal', 'transit', 'energy', 'banking'].forEach(k => setOverlay(k, false));

    // 5. 좌측 패널 펼침 상태로 복원
    setPanelCollapsed(false);

    // 6. 검색 마커 및 버퍼 원 제거
    if (typeof liveRegionBufferGroup !== 'undefined') liveRegionBufferGroup.clearLayers();
    const m = getMap();
    if (typeof currentMarker !== 'undefined' && currentMarker && m) {
      m.removeLayer(currentMarker);
      currentMarker = null;
    }

    // 7. 검색창 초기화
    const input = document.getElementById('searchInput');
    if (input) input.value = '';

    // 8. 카메라 원위치
    flyToView([36.1, 127.8], 7.2, 1.5);
  }

  // ═══════════════════════════════════════════
  // 🔊 TTS 음성 해설 (Web Speech API)
  // ═══════════════════════════════════════════
  const tts = {
    supported: ('speechSynthesis' in window) && ('SpeechSynthesisUtterance' in window),
    enabled: true,
    rate: 1.0,
    voice: null
  };
  const RATE_STEPS = [0.8, 0.9, 1.0, 1.15, 1.3, 1.5];

  let speakId = 0;
  let speakTimer = null;
  let watchdogTimer = null;
  let keepAliveUtter = null;
  let chromePauseResumeInterval = null;


  function getFriendlyVoiceName(v) {
    let name = v.name || '한국어 음성';
    name = name.replace(/Microsoft /i, 'MS ')
               .replace(/ - Korean \(Korea\)/i, '')
               .replace(/ - Korean \(Korean\)/i, '')
               .replace(/ Online \(Natural\)/i, ' (자연어)')
               .replace(/ \(Natural\)/i, ' (자연어)');
    return name;
  }

  function getKoreanVoicesList() {
    if (!tts.supported) return [];
    const voices = window.speechSynthesis.getVoices() || [];
    let ko = voices.filter(v => /^ko([-_]|$)/i.test(v.lang) || /korean|한국/i.test(v.name));
    return ko.length ? ko : voices;
  }

  function playVoicePreview(sampleText) {
    if (!tts.supported || !tts.enabled) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(sampleText || '선택하신 음성입니다.');
      u.lang = 'ko-KR';
      if (tts.voice) u.voice = tts.voice;
      u.rate = tts.rate * 0.95;
      window.speechSynthesis.speak(u);
    } catch (e) { /* noop */ }
  }

  function populateVoiceSelect() {
    const sel = document.getElementById('demoVoiceSelect');
    if (!sel || !tts.supported) return;

    const ko = getKoreanVoicesList();
    if (!ko.length) return;

    sel.innerHTML = '';
    ko.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = getFriendlyVoiceName(v);
      if (tts.voice && tts.voice.name === v.name) {
        opt.selected = true;
      }
      sel.appendChild(opt);
    });
  }

  function pickKoreanVoice() {
    if (!tts.supported) return;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;

    // 한국어 음성 목록 필터링
    const ko = voices.filter(v => /^ko([-_]|$)/i.test(v.lang) || /korean|한국/i.test(v.name));
    if (!ko.length) {
      // lang이 ko가 아니더라도 이름에 Google 또는 Korean이 들어간 것 탐색
      const gKo = voices.filter(v => /google/i.test(v.name) && /korean|한국/i.test(v.name));
      if (gKo.length) {
        tts.voice = gKo[0];
        return tts.voice;
      }
      tts.voice = null;
      return null;
    }

    // 🌟 Google 공식 한국어 음성(Google 한국의) 최우선 선택! (마이크로소프트 음성 철저 배제)
    const score = (v) => {
      let sc = 0;
      const name = (v.name || '').toLowerCase();
      
      // 1순위: Google 한국어 음성 (Google 한국의 / Google ko-KR) 단독 최우선!
      if (name.includes('google')) {
        sc += 10000;
      }
      
      // 마이크로소프트(Microsoft, Heami, SunHi 등) 음성은 강력 감점으로 배제
      if (name.includes('microsoft') || name.includes('heami') || name.includes('sunhi') || name.includes('injoon')) {
        sc -= 5000;
      }

      if (/^ko[-_]KR$/i.test(v.lang)) sc += 100;
      return sc;
    };
    ko.sort((a, b) => score(b) - score(a));
    if (!tts.voice) {
      tts.voice = ko[0];
    }
    populateVoiceSelect();
    return tts.voice;
  }

  if ('speechSynthesis' in window) {
    pickKoreanVoice();
    if (window.speechSynthesis.addEventListener) {
      window.speechSynthesis.addEventListener('voiceschanged', pickKoreanVoice);
    } else {
      window.speechSynthesis.onvoiceschanged = pickKoreanVoice;
    }
    window.addEventListener('beforeunload', () => {
      try { window.speechSynthesis.cancel(); } catch (e) { /* noop */ }
    });
  }

  function estimateMs(text) {
    return Math.max(1200, Math.round(text.length * 120 / tts.rate));
  }

  function cancelSpeech() {
    speakId++;
    clearTimeout(speakTimer);
    clearTimeout(watchdogTimer);
    keepAliveUtter = null;
    if (tts.supported) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* noop */ }
    }
  }

  function speakNarration(text, onDone, delayMs) {
    cancelSpeech();
    const id = speakId;
    const finish = () => { if (id === speakId) onDone(); };
    const lead = delayMs || 0;

    if (!text) { finish(); return; }

    if (!tts.supported || !tts.enabled) {
      speakTimer = setTimeout(finish, estimateMs(text) + lead);
      return;
    }

    // 음성 다시 한 번 확인
    pickKoreanVoice();
    const chunks = (text.match(/[^.!?]+[.!?]*/g) || [text]).map(t => t.trim()).filter(Boolean);
    let i = 0;

    // Web Speech API 폴백 함수 (구글 보이스 최우선)
    const speakNext = () => {
      if (id !== speakId) return;
      if (i >= chunks.length) {
        speakTimer = setTimeout(finish, 400);
        return;
      }
      const chunk = chunks[i++];
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang = 'ko-KR';
      if (tts.voice) u.voice = tts.voice;
      u.rate = tts.rate * 0.93; // 구글 음성에 최적화된 자연스러운 발화 속도
      u.pitch = 1.0; // 구글 음성 표준 톤
      u.volume = 1.0;

      let handled = false;
      const advance = () => {
        if (handled || id !== speakId) return;
        handled = true;
        clearTimeout(watchdogTimer);
        // 문장 사이 숨고르기(자연스러운 쉼표 호흡 160ms)
        speakTimer = setTimeout(speakNext, 160);
      };
      u.onend = advance;
      u.onerror = (e) => {
        if (e && (e.error === 'canceled' || e.error === 'interrupted')) return;
        clearTimeout(watchdogTimer);
        speakTimer = setTimeout(advance, estimateMs(chunk));
      };

      keepAliveUtter = u;
      clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(() => {
        if (handled || id !== speakId) return;
        try { window.speechSynthesis.cancel(); } catch (e) { /* noop */ }
        advance();
      }, estimateMs(chunk) * 3 + 4000);

      window.speechSynthesis.speak(u);
    };

    speakTimer = setTimeout(speakNext, 120 + lead);
  }

  function showCaption(text) {
    const el = document.getElementById('demoCaption');
    if (!el) return;
    el.textContent = text || '';
    el.style.opacity = text ? '1' : '0';
  }
  function hideCaption() { showCaption(''); }

  // ═══════════════════════════════════════════
  // 시연 진행 상태
  // ═══════════════════════════════════════════
  let currentStepIndex = 0;
  let isRunning = false;
  let isPaused = false;
  let isMinimized = false;

  let runToken = 0;
  let actionDone = false;
  let speechDone = false;
  let pendingResume = false;
  let resumeSeg = 0;
  let currentSegIndex = 0;
  let activeStep = null;
  let gapSeq = 0;

  function getSegments(step) {
    const seg = (typeof step.segments === 'function') ? step.segments() : step.segments;
    if (Array.isArray(seg) && seg.length) return seg;
    return [{ text: step.narration }];
  }

  function startNarration(step, token, fromSeg) {
    speechDone = false;
    const segs = getSegments(step);
    let i = Math.min(fromSeg || 0, segs.length);

    const playNext = () => {
      if (token !== runToken) return;
      if (i >= segs.length) {
        currentSegIndex = 0;
        speechDone = true;
        tryAdvance(token);
        return;
      }
      currentSegIndex = i;
      const seg = segs[i++];
      try { if (seg.before) seg.before(); } catch (e) { console.warn('[demo] before hook error', e); }

      let text = '';
      try { text = (typeof seg.text === 'function') ? seg.text() : seg.text; } catch (e) { text = ''; }

      if (seg.caption === false || !text) hideCaption(); else showCaption(text);
      if (!text) { playNext(); return; }
      speakNarration(text, playNext, seg.delay);
    };
    playNext();
  }

  function finishActiveStep() {
    clearHl();
    const st = activeStep;
    activeStep = null;
    if (st && st.after) {
      try { st.after(); } catch (e) { console.warn('[demo] after hook error', e); }
    }
  }

  function tryAdvance(token) {
    if (!isRunning || token !== runToken) return;
    if (!actionDone || !speechDone) return;
    if (isPaused) return;

    const hadAfter = !!(activeStep && activeStep.after);
    finishActiveStep();

    const seq = ++gapSeq;
    const go = () => {
      if (!isRunning || token !== runToken || seq !== gapSeq) return;
      if (isPaused) return;
      currentStepIndex++;
      runStep();
    };
    if (hadAfter) setTimeout(go, 450);
    else go();
  }

  function updateVoiceUI() {
    const vBtn = document.getElementById('demoVoiceBtn');
    const rBtn = document.getElementById('demoRateBtn');
    if (vBtn) {
      if (!tts.supported) {
        vBtn.innerText = '🔇 음성 미지원';
        vBtn.disabled = true;
        vBtn.style.opacity = '0.5';
      } else {
        vBtn.innerText = tts.enabled ? '🔊 음성 켜짐' : '🔇 음성 꺼짐';
        vBtn.style.background = tts.enabled ? 'rgba(0,122,255,0.12)' : '#f2f2f7';
        vBtn.style.color = tts.enabled ? '#007aff' : '#8e8e93';
      }
    }
    if (rBtn) {
      rBtn.innerText = `속도 ${tts.rate.toFixed(1)}x`;
      rBtn.disabled = !tts.supported;
      rBtn.style.opacity = tts.supported ? '1' : '0.5';
    }
  }

  function restartNarrationIfNeeded() {
    if (!isRunning || isPaused || speechDone) return;
    startNarration(demoSteps[currentStepIndex], runToken, currentSegIndex);
  }

  function toggleVoice() {
    if (!tts.supported) return;
    tts.enabled = !tts.enabled;
    updateVoiceUI();
    if (!tts.enabled) {
      cancelSpeech();
    } else {
      restartNarrationIfNeeded();
    }
  }

  function cycleRate() {
    if (!tts.supported) return;
    const idx = RATE_STEPS.indexOf(tts.rate);
    tts.rate = RATE_STEPS[(idx + 1) % RATE_STEPS.length];
    updateVoiceUI();
    restartNarrationIfNeeded();
  }

  function createDemoControllerUI() {
    if (document.getElementById('demoControlWidget')) return;

    const widget = document.createElement('div');
    widget.id = 'demoControlWidget';
    widget.className = 'demo-control-widget';
    widget.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 10000;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.7);
      border-radius: 18px;
      padding: 12px 16px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      width: 290px;
      box-sizing: border-box;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    widget.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:15px;">🎬</span>
          <span style="font-weight:800; font-size:13px; color:#1d1d1f; letter-spacing:-0.2px;">Google TTS 시연</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span id="demoStepBadge" style="font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:10px; background:#e5e5ea; color:#3a3a3c;">
            READY
          </span>
          <button id="demoMinimizeBtn" title="최소화" style="background:none; border:none; cursor:pointer; font-size:12px; color:#8e8e93; padding:2px; line-height:1;">
            ✕
          </button>
        </div>
      </div>

      <div style="width:100%; height:3.5px; background:rgba(0,0,0,0.06); border-radius:2px; margin-bottom:9px; overflow:hidden;">
        <div id="demoProgressBar" style="width:0%; height:100%; background:linear-gradient(90deg, #007aff, #5856d6); transition:width 0.35s ease; border-radius:2px;"></div>
      </div>

      <div id="demoTitle" style="font-size:12.5px; font-weight:700; color:#007aff; margin-bottom:10px; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        원터치 Google TTS 자동 시연
      </div>

      <!-- 🗣️ 음성 선택 드롭다운 & 미리듣기 -->
      <div style="display:flex; align-items:center; gap:5px; margin-bottom:8px; background:rgba(0,0,0,0.03); padding:4px 6px; border-radius:8px;">
        <span style="font-size:11px; font-weight:700; color:#515156; white-space:nowrap;">🗣️ 음성:</span>
        <select id="demoVoiceSelect" style="flex:1; min-width:0; padding:4px 5px; border:1px solid #d1d1d6; border-radius:6px; background:#fff; font-size:11px; font-weight:600; color:#1d1d1f; outline:none; cursor:pointer;" title="원하는 다른 음성을 선택하세요">
          <option value="">음성 불러오는 중...</option>
        </select>
        <button id="demoTestVoiceBtn" title="선택한 음성 1초 미리듣기" style="flex-shrink:0; padding:4px 7px; border:1px solid #007aff; border-radius:6px; background:rgba(0,122,255,0.08); color:#007aff; font-size:10px; font-weight:700; cursor:pointer;">
          듣기
        </button>
      </div>

      <div style="display:flex; gap:6px; margin-bottom:10px;">
        <button id="demoVoiceBtn" style="flex:1.3; padding:5px 6px; border:none; border-radius:7px; background:rgba(0,122,255,0.12); color:#007aff; font-size:11px; font-weight:700; cursor:pointer; transition: all 0.15s ease;">🔊 음성 켜짐</button>
        <button id="demoRateBtn" style="flex:1; padding:5px 6px; border:1px solid #d1d1d6; border-radius:7px; background:#fff; color:#3a3a3c; font-size:11px; font-weight:600; cursor:pointer; transition: all 0.15s ease;">속도 1.0x</button>
      </div>

      <div id="demoBtnGroupReady" style="display:flex; gap:6px;">
        <button id="demoStartBtn" style="flex:1; padding:8px 12px; border:none; border-radius:10px; background:linear-gradient(135deg, #007aff, #0056b3); color:#fff; font-size:12px; font-weight:800; cursor:pointer; box-shadow:0 3px 10px rgba(0,122,255,0.3); transition:all 0.2s;">
          ▶ Google TTS 자동 시연 시작
        </button>
      </div>

      <div id="demoBtnGroupRunning" style="display:none; gap:5px; flex-wrap:wrap;">
        <button id="demoPrevBtn" style="flex:1; padding:6px 6px; border:1px solid #d1d1d6; border-radius:7px; background:#fff; color:#1d1d1f; font-size:11px; font-weight:600; cursor:pointer; transition: all 0.15s ease;">
          ◀ 이전
        </button>
        <button id="demoPauseBtn" style="flex:1.2; padding:6px 6px; border:none; border-radius:7px; background:#ff9500; color:#fff; font-size:11px; font-weight:700; cursor:pointer; transition: all 0.15s ease;">
          ⏸ 일시정지
        </button>
        <button id="demoNextBtn" style="flex:1; padding:6px 6px; border:1px solid #d1d1d6; border-radius:7px; background:#fff; color:#1d1d1f; font-size:11px; font-weight:600; cursor:pointer; transition: all 0.15s ease;">
          다음 ▶
        </button>
        <button id="demoStopBtn" style="width:100%; margin-top:3px; padding:5px; border:none; border-radius:7px; background:rgba(255,59,48,0.12); color:#ff3b30; font-size:11px; font-weight:700; cursor:pointer; transition: all 0.15s ease;">
          ⏹ 시연 즉시 종료
        </button>
      </div>
    `;

    document.body.appendChild(widget);

    if (!document.getElementById('demoCaptionStyle')) {
      const st = document.createElement('style');
      st.id = 'demoCaptionStyle';
      st.textContent = `
        #demoCaption {
          position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
          z-index: 9999; max-width: min(720px, calc(100vw - 360px));
          padding: 12px 20px; border-radius: 14px;
          background: rgba(20, 20, 24, 0.82); color: #fff;
          backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
          font-size: 15px; font-weight: 600; line-height: 1.5; text-align: center;
          letter-spacing: -0.2px; pointer-events: none; opacity: 0;
          transition: opacity 0.25s ease; box-shadow: 0 8px 28px rgba(0,0,0,0.3);
          word-break: keep-all;
        }
        @media (max-width: 760px) {
          #demoCaption { max-width: calc(100vw - 32px); bottom: 210px; font-size: 13.5px; }
          #demoControlWidget {
            right: 12px !important;
            bottom: 60px !important;
            width: calc(100vw - 24px) !important;
            max-width: 360px !important;
            padding: 12px 14px !important;
            border-radius: 14px !important;
          }
          #demoFloatingMiniPill {
            right: 12px !important;
            bottom: 60px !important;
            padding: 7px 12px !important;
            font-size: 11.5px !important;
          }
        }
      `;
      document.head.appendChild(st);
    }
    if (!document.getElementById('demoCaption')) {
      const cap = document.createElement('div');
      cap.id = 'demoCaption';
      cap.setAttribute('aria-live', 'polite');
      document.body.appendChild(cap);
    }

    document.getElementById('demoStartBtn').addEventListener('click', startDemo);
    document.getElementById('demoPauseBtn').addEventListener('click', togglePauseDemo);
    document.getElementById('demoStopBtn').addEventListener('click', stopDemo);
    document.getElementById('demoPrevBtn').addEventListener('click', prevStep);
    document.getElementById('demoNextBtn').addEventListener('click', nextStep);
    document.getElementById('demoMinimizeBtn').addEventListener('click', toggleMinimizeWidget);
    document.getElementById('demoVoiceBtn').addEventListener('click', toggleVoice);
    document.getElementById('demoRateBtn').addEventListener('click', cycleRate);

    const voiceSel = document.getElementById('demoVoiceSelect');
    if (voiceSel) {
      voiceSel.addEventListener('change', () => {
        const chosen = voiceSel.value;
        const all = window.speechSynthesis.getVoices() || [];
        const match = all.find(v => v.name === chosen);
        if (match) {
          tts.voice = match;
          playVoicePreview('음성이 변경되었습니다.');
          restartNarrationIfNeeded();
        }
      });
    }

    const testBtn = document.getElementById('demoTestVoiceBtn');
    if (testBtn) {
      testBtn.addEventListener('click', () => {
        playVoicePreview('인프라 분석 지도의 음성 안내입니다.');
      });
    }

    populateVoiceSelect();
    updateVoiceUI();
  }

  function toggleMinimizeWidget() {
    const widget = document.getElementById('demoControlWidget');
    if (!widget) return;

    isMinimized = !isMinimized;
    if (isMinimized) {
      widget.style.display = 'none';
      createMinimizedFloatingButton();
    } else {
      widget.style.display = 'block';
      removeMinimizedFloatingButton();
    }
  }

  function createMinimizedFloatingButton() {
    if (document.getElementById('demoFloatingMiniPill')) return;
    const miniPill = document.createElement('button');
    miniPill.id = 'demoFloatingMiniPill';
    miniPill.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 10000;
      background: rgba(0, 122, 255, 0.92);
      color: #fff;
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 20px;
      padding: 7px 14px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 6px 20px rgba(0, 122, 255, 0.35);
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.2s ease;
    `;
    miniPill.innerHTML = `🎬 Google TTS ${isRunning ? `(${currentStepIndex + 1}/${demoSteps.length})` : ''}`;
    miniPill.addEventListener('click', () => {
      toggleMinimizeWidget();
    });
    document.body.appendChild(miniPill);
  }

  function removeMinimizedFloatingButton() {
    const miniPill = document.getElementById('demoFloatingMiniPill');
    if (miniPill) miniPill.remove();
  }

  /**
   * 🎬 Google TTS 자동 시연 시작
   * 모바일/브라우저 오디오 자동 재생 정책 해제를 위한 워밍업
   */
  function startDemo() {
    if (isMinimized) toggleMinimizeWidget();
    isRunning = true;
    isPaused = false;
    currentStepIndex = 0;

    document.getElementById('demoBtnGroupReady').style.display = 'none';
    document.getElementById('demoBtnGroupRunning').style.display = 'flex';

    pickKoreanVoice();
    runStep();
  }

  function runStep() {
    if (!isRunning) return;
    finishActiveStep();

    if (currentStepIndex >= demoSteps.length) {
      completeDemo();
      return;
    }

    if (currentStepIndex < 0) {
      currentStepIndex = 0;
    }

    const step = demoSteps[currentStepIndex];
    const total = demoSteps.length;
    const pct = Math.round(((currentStepIndex + 1) / total) * 100);

    const badge = document.getElementById('demoStepBadge');
    if (badge) {
      badge.innerText = `${currentStepIndex + 1} / ${total}`;
      badge.style.background = '#007aff';
      badge.style.color = '#fff';
    }

    const pBar = document.getElementById('demoProgressBar');
    if (pBar) pBar.style.width = `${pct}%`;

    const titleEl = document.getElementById('demoTitle');
    if (titleEl) titleEl.innerText = step.title;

    // 최소화 상태의 미니 필 업데이트
    const miniPill = document.getElementById('demoFloatingMiniPill');
    if (miniPill) miniPill.innerHTML = `🎬 Google TTS (${currentStepIndex + 1}/${total})`;

    const token = ++runToken;
    actionDone = false;
    speechDone = false;
    pendingResume = false;

    activeStep = step;
    currentSegIndex = 0;
    resumeSeg = 0;
    startNarration(step, token, 0);

    step.action(() => {
      if (token !== runToken) return;
      actionDone = true;
      tryAdvance(token);
    });
  }

  function togglePauseDemo() {
    const pauseBtn = document.getElementById('demoPauseBtn');
    if (!isPaused) {
      isPaused = true;
      if (!speechDone) {
        pendingResume = true;
        resumeSeg = currentSegIndex;
        cancelSpeech();
      }
      pauseBtn.innerText = "▶ 재개";
      pauseBtn.style.background = "#34c759";
      const titleEl = document.getElementById('demoTitle');
      if (titleEl) titleEl.innerText = "[일시정지됨] 클릭 시 계속 진행";
    } else {
      isPaused = false;
      pauseBtn.innerText = "⏸ 일시정지";
      pauseBtn.style.background = "#ff9500";
      const titleEl = document.getElementById('demoTitle');
      if (titleEl) titleEl.innerText = demoSteps[currentStepIndex].title;
      if (pendingResume) {
        pendingResume = false;
        startNarration(demoSteps[currentStepIndex], runToken, resumeSeg);
      }
      tryAdvance(runToken);
    }
  }

  function prevStep() {
    if (!isRunning) return;
    cancelSpeech();
    isPaused = false;
    const pauseBtn = document.getElementById('demoPauseBtn');
    if (pauseBtn) {
      pauseBtn.innerText = "⏸ 일시정지";
      pauseBtn.style.background = "#ff9500";
    }
    currentStepIndex = Math.max(0, currentStepIndex - 1);
    runStep();
  }

  function nextStep() {
    if (!isRunning) return;
    cancelSpeech();
    isPaused = false;
    const pauseBtn = document.getElementById('demoPauseBtn');
    if (pauseBtn) {
      pauseBtn.innerText = "⏸ 일시정지";
      pauseBtn.style.background = "#ff9500";
    }
    currentStepIndex = Math.min(demoSteps.length - 1, currentStepIndex + 1);
    runStep();
  }

  function completeDemo() {
    runToken++;
    cancelSpeech();
    hideCaption();
    finishActiveStep();
    isRunning = false;
    isPaused = false;
    currentStepIndex = 0;

    document.getElementById('demoBtnGroupReady').style.display = 'flex';
    document.getElementById('demoBtnGroupRunning').style.display = 'none';

    const startBtn = document.getElementById('demoStartBtn');
    if (startBtn) {
      startBtn.innerText = '↺ Google TTS 시연 다시 시작';
    }

    const badge = document.getElementById('demoStepBadge');
    if (badge) {
      badge.innerText = '완료 🎉';
      badge.style.background = '#34c759';
      badge.style.color = '#fff';
    }

    const pBar = document.getElementById('demoProgressBar');
    if (pBar) pBar.style.width = '100%';

    const titleEl = document.getElementById('demoTitle');
    if (titleEl) titleEl.innerText = '모든 시연이 완료되었습니다 ✨';
  }

  function stopDemo() {
    runToken++;
    cancelSpeech();
    hideCaption();
    finishActiveStep();
    isRunning = false;
    isPaused = false;
    currentStepIndex = 0;

    cleanupDemoState();

    document.getElementById('demoBtnGroupReady').style.display = 'flex';
    document.getElementById('demoBtnGroupRunning').style.display = 'none';

    const startBtn = document.getElementById('demoStartBtn');
    if (startBtn) {
      startBtn.innerText = '▶ Google TTS 자동 시연 시작';
    }

    const badge = document.getElementById('demoStepBadge');
    if (badge) {
      badge.innerText = 'READY';
      badge.style.background = '#e5e5ea';
      badge.style.color = '#3a3a3c';
    }

    const pBar = document.getElementById('demoProgressBar');
    if (pBar) pBar.style.width = '0%';

    const titleEl = document.getElementById('demoTitle');
    if (titleEl) titleEl.innerText = '시연이 종료되었습니다';
  }

  window.startInfrastructureAutoDemo = function () {
    const widget = document.getElementById('demoControlWidget');
    if (widget && widget.style.display === 'none') {
      toggleMinimizeWidget();
    }
    startDemo();
  };
  window.stopInfrastructureAutoDemo = stopDemo;
  window.toggleDemoWidget = function () {
    const widget = document.getElementById('demoControlWidget');
    if (!widget) {
      createDemoControllerUI();
      return;
    }
    toggleMinimizeWidget();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createDemoControllerUI);
  } else {
    createDemoControllerUI();
  }
})();
