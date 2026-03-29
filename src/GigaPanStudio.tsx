import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Camera, Download, Hand, Info, RefreshCw } from 'lucide-react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import {
  buildPanoramaFromLibrary,
  createFocusBoost,
  type NormalizedRect,
  type PanoramaResult,
  type QualitySettings,
  type StitchDiagnostics,
} from './panoramaEngine';

type Step = 'intro' | 'capture' | 'library' | 'preview';

type DeviceOrientationPermission = {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

const DEFAULT_SETTINGS: QualitySettings = {
  denoiseStrength: 0.35,
  edgeBoost: 1.05,
  colorBoost: 12,
  exposureBoost: 6,
  searchRadius: 52,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatMegaPixels(width: number, height: number) {
  return `${((width * height) / 1_000_000).toFixed(1)}MP`;
}

export default function GigaPanStudio() {
  const [step, setStep] = useState<Step>('intro');
  const [result, setResult] = useState<PanoramaResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<StitchDiagnostics | null>(null);

  return (
    <div className="min-h-screen text-slate-100">
      {step === 'intro' && (
        <IntroScreen
          onStartCamera={() => setStep('capture')}
          onStartLibrary={() => setStep('library')}
        />
      )}

      {step === 'capture' && (
        <CaptureScreen
          onBack={() => setStep('intro')}
          onFinish={(nextResult) => {
            setResult(nextResult);
            setDiagnostics(null);
            setStep('preview');
          }}
        />
      )}

      {step === 'library' && (
        <LibraryStudio
          onBack={() => setStep('intro')}
          onFinish={(nextResult, nextDiagnostics) => {
            setResult(nextResult);
            setDiagnostics(nextDiagnostics);
            setStep('preview');
          }}
        />
      )}

      {step === 'preview' && result && (
        <PreviewScreen
          result={result}
          diagnostics={diagnostics}
          onReset={() => {
            setResult(null);
            setDiagnostics(null);
            setStep('intro');
          }}
        />
      )}
    </div>
  );
}

function IntroScreen({
  onStartCamera,
  onStartLibrary,
}: {
  onStartCamera: () => void;
  onStartLibrary: () => void;
}) {
  return (
    <div className="app-surface min-h-screen p-6 md:p-10">
      <div className="mx-auto flex min-h-[88vh] w-full max-w-6xl flex-col justify-between rounded-3xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl md:p-10">
        <div>
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-semibold tracking-wide text-cyan-100">
            <Info className="h-4 w-4" />
            AI Panorama Lab
          </div>

          <h1 className="text-4xl font-extrabold leading-tight text-white md:text-6xl">
            GigaPan Studio
            <span className="mt-2 block bg-gradient-to-r from-cyan-300 via-blue-200 to-emerald-200 bg-clip-text text-2xl text-transparent md:text-3xl">
              モダンUIで高精度ギガピクセル生成
            </span>
          </h1>

          <p className="mt-6 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
            写真ライブラリの複数画像をAI風アルゴリズムで高精度に位置合わせし、巨大パノラマへ自動合成します。
            さらに生成後はズーム対象を選択して、選択領域だけを超高画質に再生成できます。
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <FeatureCard title="Photo Library Stitch" description="既存写真を読み込むだけで位置合わせ + 合成" />
            <FeatureCard title="ML-Inspired Enhancement" description="ノイズ低減 / エッジ補強 / 露出最適化" />
            <FeatureCard title="Focus Boost" description="選択範囲だけを超高解像で書き出し" />
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <button
            onClick={onStartLibrary}
            className="group rounded-2xl border border-emerald-300/40 bg-gradient-to-br from-emerald-400/25 to-cyan-500/20 p-6 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-200/60 hover:shadow-xl hover:shadow-emerald-400/20"
          >
            <div className="text-xs font-semibold tracking-wide text-emerald-100/90">推奨フロー</div>
            <h2 className="mt-2 text-2xl font-bold text-white">ライブラリから高精度生成</h2>
            <p className="mt-2 text-sm text-emerald-50/85">
              2枚以上の写真を選ぶだけで、自動ステッチングしてギガピクセル相当の出力を作成します。
            </p>
          </button>

          <button
            onClick={onStartCamera}
            className="group rounded-2xl border border-blue-300/35 bg-gradient-to-br from-blue-500/20 to-violet-500/20 p-6 text-left transition-all hover:-translate-y-0.5 hover:border-blue-200/60 hover:shadow-xl hover:shadow-blue-400/20"
          >
            <div className="text-xs font-semibold tracking-wide text-blue-100/90">ライブモード</div>
            <h2 className="mt-2 flex items-center gap-2 text-2xl font-bold text-white">
              <Camera className="h-6 w-6" />
              カメラ・ペイント収集
            </h2>
            <p className="mt-2 text-sm text-blue-50/85">
              端末の向きを使って手動で巨大キャンバスにペイントし、リアルタイムに素材を積み上げます。
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
    </div>
  );
}

function CaptureScreen({
  onFinish,
  onBack,
}: {
  onFinish: (result: PanoramaResult) => void;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);

  const [hasPermissions, setHasPermissions] = useState(false);
  const [error, setError] = useState('');
  const [orientation, setOrientation] = useState({ alpha: 0, beta: 0, gamma: 0 });
  const [initialOrientation, setInitialOrientation] = useState<{ alpha: number; beta: number } | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [paintCount, setPaintCount] = useState(0);

  const CANVAS_WIDTH = 4500;
  const CANVAS_HEIGHT = 4500;
  const PIXELS_PER_DEGREE = 28;
  const VIDEO_SCALE = 0.42;

  const handleOrientation = (event: DeviceOrientationEvent) => {
    setOrientation((previous) => {
      const targetAlpha = event.alpha ?? previous.alpha;
      const targetBeta = event.beta ?? previous.beta;
      const targetGamma = event.gamma ?? previous.gamma;
      const smoothing = 0.18;

      return {
        alpha: previous.alpha + (targetAlpha - previous.alpha) * smoothing,
        beta: previous.beta + (targetBeta - previous.beta) * smoothing,
        gamma: previous.gamma + (targetGamma - previous.gamma) * smoothing,
      };
    });
  };

  useEffect(() => {
    let stream: MediaStream | null = null;

    const requestPermissions = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const orientationPermission = DeviceOrientationEvent as DeviceOrientationPermission;
        if (typeof orientationPermission.requestPermission === 'function') {
          const status = await orientationPermission.requestPermission();
          if (status !== 'granted') {
            setError('センサー権限が拒否されました。ブラウザ設定で許可してください。');
            return;
          }
        }

        window.addEventListener('deviceorientation', handleOrientation);

        if (canvasRef.current) {
          const context = canvasRef.current.getContext('2d');
          if (context) {
            const gradient = context.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            gradient.addColorStop(0, '#020617');
            gradient.addColorStop(1, '#0f172a');
            context.fillStyle = gradient;
            context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          }
        }

        setHasPermissions(true);
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : 'カメラ初期化に失敗しました。';
        setError(message);
      }
    };

    void requestPermissions();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  const setCenter = () => {
    setInitialOrientation({ alpha: orientation.alpha, beta: orientation.beta });
  };

  const getAngleDiff = (target: number, source: number) => {
    let diff = target - source;
    while (diff < -180) {
      diff += 360;
    }
    while (diff > 180) {
      diff -= 360;
    }
    return diff;
  };

  const updateMiniMap = (x: number, y: number, width: number, height: number) => {
    if (!mapCanvasRef.current) {
      return;
    }

    const context = mapCanvasRef.current.getContext('2d');
    if (!context) {
      return;
    }

    const scaleX = mapCanvasRef.current.width / CANVAS_WIDTH;
    const scaleY = mapCanvasRef.current.height / CANVAS_HEIGHT;

    context.fillStyle = 'rgba(34, 211, 238, 0.12)';
    context.strokeStyle = 'rgba(34, 211, 238, 0.52)';

    const mapX = (x - width / 2) * scaleX;
    const mapY = (y - height / 2) * scaleY;
    const mapW = width * scaleX;
    const mapH = height * scaleY;

    context.fillRect(mapX, mapY, mapW, mapH);
    context.strokeRect(mapX, mapY, mapW, mapH);
  };

  useEffect(() => {
    let rafId = 0;

    const draw = () => {
      if (isPainting && initialOrientation && videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        if (video.readyState >= 2) {
          const context = canvasRef.current.getContext('2d');
          if (context) {
            const dx = getAngleDiff(orientation.alpha, initialOrientation.alpha) * PIXELS_PER_DEGREE;
            const dy = getAngleDiff(orientation.beta, initialOrientation.beta) * PIXELS_PER_DEGREE;

            const centerX = CANVAS_WIDTH / 2 - dx;
            const centerY = CANVAS_HEIGHT / 2 + dy;
            const frameWidth = video.videoWidth * VIDEO_SCALE;
            const frameHeight = video.videoHeight * VIDEO_SCALE;

            context.drawImage(video, centerX - frameWidth / 2, centerY - frameHeight / 2, frameWidth, frameHeight);
            updateMiniMap(centerX, centerY, frameWidth, frameHeight);
            setPaintCount((previous) => previous + 1);
          }
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isPainting, initialOrientation, orientation]);

  const finishPainting = () => {
    if (!canvasRef.current) {
      return;
    }

    const qualityScore = Math.round(clamp(56 + paintCount * 0.03, 56, 94));

    onFinish({
      url: canvasRef.current.toDataURL('image/jpeg', 0.95),
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      frames: paintCount,
      methodLabel: 'Camera Sensor Paint',
      qualityScore,
    });
  };

  if (error) {
    return (
      <div className="app-surface flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-rose-400/30 bg-slate-950/80 p-6 text-center">
          <p className="text-sm text-rose-200">{error}</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button onClick={onBack} className="rounded-lg border border-white/20 px-4 py-2 text-xs text-slate-200">
              戻る
            </button>
            <button onClick={() => window.location.reload()} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950">
              再試行
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasPermissions) {
    return (
      <div className="app-surface flex min-h-screen items-center justify-center text-sm text-slate-200">
        カメラ・センサーを初期化中...
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="hidden" />

      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover opacity-80" />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 md:p-6">
        <div className="pointer-events-auto flex items-start justify-between gap-3">
          <div className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 backdrop-blur-md">
            <p>Pan α: {orientation.alpha.toFixed(1)}°</p>
            <p>Tilt β: {orientation.beta.toFixed(1)}°</p>
            <p>Frame: {paintCount}</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/70 p-2 backdrop-blur-md">
            <canvas ref={mapCanvasRef} width={120} height={120} className="rounded-md bg-slate-900" />
            <p className="mt-1 text-center text-[10px] text-slate-300">Coverage Map</p>
          </div>
        </div>

        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-70">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/60">
            <div className="h-1 w-1 rounded-full bg-cyan-200" />
          </div>
        </div>

        <div className="pointer-events-auto flex flex-col items-center gap-4 pb-8">
          {!initialOrientation ? (
            <>
              <button
                onClick={onBack}
                className="rounded-full border border-white/30 bg-slate-900/80 px-5 py-2 text-xs font-semibold text-slate-100"
              >
                戻る
              </button>
              <button
                onClick={setCenter}
                className="rounded-full bg-emerald-400 px-7 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20"
              >
                正面を向いて開始
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <button
                onPointerDown={() => setIsPainting(true)}
                onPointerUp={() => setIsPainting(false)}
                onPointerLeave={() => setIsPainting(false)}
                onContextMenu={(event) => event.preventDefault()}
                className={`touch-none select-none rounded-full border-4 p-5 transition-all ${
                  isPainting
                    ? 'border-cyan-200 bg-cyan-400 text-slate-950 shadow-[0_0_40px_rgba(34,211,238,0.35)]'
                    : 'border-white/50 bg-white text-slate-900'
                }`}
              >
                <Hand className="h-7 w-7" />
              </button>
              <p className="rounded-full bg-slate-950/75 px-4 py-2 text-xs text-slate-200">押している間だけ収集</p>
              <button
                onClick={finishPainting}
                className="rounded-full bg-cyan-400 px-7 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/25"
              >
                生成してプレビューへ
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LibraryStudio({
  onBack,
  onFinish,
}: {
  onBack: () => void;
  onFinish: (result: PanoramaResult, diagnostics: StitchDiagnostics) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [settings, setSettings] = useState<QualitySettings>(DEFAULT_SETTINGS);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('ライブラリ写真を選択してください。');
  const [error, setError] = useState('');

  const handleFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []);
    setFiles(nextFiles);
    setError('');
    setStatus(nextFiles.length > 0 ? `${nextFiles.length}枚の写真を選択中` : 'ライブラリ写真を選択してください。');
  };

  const updateSetting = <K extends keyof QualitySettings>(key: K, value: number) => {
    setSettings((previous) => ({ ...previous, [key]: value }));
  };

  const startStitch = async () => {
    if (files.length < 2) {
      setError('2枚以上の写真を選択してください。');
      return;
    }

    setProcessing(true);
    setError('');
    setProgress(0);

    try {
      const ordered = [...files].sort((left, right) => left.lastModified - right.lastModified);
      const { result, diagnostics } = await buildPanoramaFromLibrary(ordered, settings, (nextProgress, message) => {
        setProgress(nextProgress);
        setStatus(message);
      });

      onFinish(result, diagnostics);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'パノラマ生成中にエラーが発生しました。';
      setError(message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="app-surface min-h-screen p-6 md:p-10">
      <div className="mx-auto w-full max-w-6xl rounded-3xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl backdrop-blur-xl md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-cyan-200">Photo Library AI Stitch</p>
            <h2 className="mt-1 text-2xl font-bold text-white md:text-3xl">高精度ギガピクセル生成</h2>
          </div>
          <button onClick={onBack} className="rounded-full border border-white/20 px-5 py-2 text-xs font-semibold text-slate-200">
            戻る
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFilesChange}
              className="hidden"
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => inputRef.current?.click()}
                className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950"
              >
                写真を選択
              </button>
              <button
                onClick={startStitch}
                disabled={processing || files.length < 2}
                className="rounded-xl border border-emerald-300/40 bg-emerald-400/20 px-5 py-3 text-sm font-bold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {processing ? '生成中...' : 'AIステッチ開始'}
              </button>
              <p className="text-xs text-slate-300">{status}</p>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>

            {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

            <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-xs font-semibold tracking-wide text-slate-300">選択ファイル ({files.length}枚)</p>
              {files.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">写真を選択するとここに一覧が表示されます。</p>
              ) : (
                <ul className="mt-2 max-h-52 space-y-1 overflow-auto text-xs text-slate-300">
                  {files.map((file) => (
                    <li key={`${file.name}-${file.lastModified}`} className="truncate rounded bg-slate-900/70 px-2 py-1">
                      {file.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <h3 className="text-sm font-semibold text-white">高精度設定 (ML風)</h3>
            <p className="mt-1 text-xs text-slate-400">ノイズ低減、エッジ補強、色補正、探索範囲を調整します。</p>

            <SettingSlider
              label="ノイズ低減"
              min={0}
              max={1}
              step={0.05}
              value={settings.denoiseStrength}
              onChange={(value) => updateSetting('denoiseStrength', value)}
            />
            <SettingSlider
              label="ディテール補強"
              min={0.3}
              max={2}
              step={0.05}
              value={settings.edgeBoost}
              onChange={(value) => updateSetting('edgeBoost', value)}
            />
            <SettingSlider
              label="色彩補強"
              min={0}
              max={28}
              step={1}
              value={settings.colorBoost}
              onChange={(value) => updateSetting('colorBoost', value)}
            />
            <SettingSlider
              label="露出補正"
              min={-10}
              max={24}
              step={1}
              value={settings.exposureBoost}
              onChange={(value) => updateSetting('exposureBoost', value)}
            />
            <SettingSlider
              label="位置合わせ探索範囲"
              min={24}
              max={96}
              step={2}
              value={settings.searchRadius}
              onChange={(value) => updateSetting('searchRadius', value)}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

function SettingSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mt-4 block">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
        <span>{label}</span>
        <span>{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-cyan-300"
      />
    </label>
  );
}

function PreviewScreen({
  result,
  diagnostics,
  onReset,
}: {
  result: PanoramaResult;
  diagnostics: StitchDiagnostics | null;
  onReset: () => void;
}) {
  const sourceRef = useRef<HTMLDivElement>(null);

  const [selection, setSelection] = useState<NormalizedRect | null>(null);
  const [draftSelection, setDraftSelection] = useState<NormalizedRect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const [upscaleFactor, setUpscaleFactor] = useState(3);
  const [detailAmount, setDetailAmount] = useState(1.25);
  const [denoiseStrength, setDenoiseStrength] = useState(0.32);

  const [focusResult, setFocusResult] = useState<{ url: string; width: number; height: number } | null>(null);
  const [focusBusy, setFocusBusy] = useState(false);
  const [focusError, setFocusError] = useState('');

  const activeSelection = draftSelection ?? selection;

  const toNormalizedPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = sourceRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    return { x, y };
  };

  const beginSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = toNormalizedPoint(event);
    if (!point) {
      return;
    }

    setDragStart(point);
    setDraftSelection({ x: point.x, y: point.y, w: 0, h: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart) {
      return;
    }

    const point = toNormalizedPoint(event);
    if (!point) {
      return;
    }

    setDraftSelection({
      x: Math.min(dragStart.x, point.x),
      y: Math.min(dragStart.y, point.y),
      w: Math.abs(point.x - dragStart.x),
      h: Math.abs(point.y - dragStart.y),
    });
  };

  const endSelection = () => {
    if (!draftSelection) {
      setDragStart(null);
      return;
    }

    if (draftSelection.w < 0.03 || draftSelection.h < 0.03) {
      setSelection(null);
    } else {
      setSelection(draftSelection);
    }

    setDraftSelection(null);
    setDragStart(null);
  };

  const boostFocusRegion = async () => {
    if (!selection) {
      setFocusError('先に選択範囲をドラッグで指定してください。');
      return;
    }

    setFocusBusy(true);
    setFocusError('');

    try {
      const nextResult = await createFocusBoost(
        result.url,
        selection,
        upscaleFactor,
        detailAmount,
        denoiseStrength,
      );
      setFocusResult(nextResult);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Focus Boostの生成に失敗しました。';
      setFocusError(message);
    } finally {
      setFocusBusy(false);
    }
  };

  const selectedPixelWidth = selection ? Math.max(1, Math.round(result.width * selection.w)) : 0;
  const selectedPixelHeight = selection ? Math.max(1, Math.round(result.height * selection.h)) : 0;

  return (
    <div className="app-surface min-h-screen p-4 md:p-6">
      <div className="mx-auto flex min-h-[92vh] w-full max-w-7xl flex-col rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur-xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 md:px-6">
          <div>
            <h2 className="text-xl font-bold text-white md:text-2xl">Panorama Result</h2>
            <p className="text-xs text-slate-300">
              {result.methodLabel} • {result.frames} frames • {formatMegaPixels(result.width, result.height)} • Quality {result.qualityScore}
            </p>
            {diagnostics && (
              <p className="mt-1 text-[11px] text-slate-400">
                Alignment Confidence {(diagnostics.averageConfidence * 100).toFixed(1)}% / Overlap {(diagnostics.averageOverlap * 100).toFixed(1)}%
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={result.url}
              download="gigapan.jpg"
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950"
            >
              <Download className="h-4 w-4" />
              保存
            </a>
            <button
              onClick={onReset}
              className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-4 py-2 text-sm font-semibold text-slate-100"
            >
              <RefreshCw className="h-4 w-4" />
              新規作成
            </button>
          </div>
        </header>

        <main className="grid flex-1 gap-4 p-4 md:grid-cols-[1.5fr_1fr] md:p-6">
          <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/75">
            <TransformWrapper initialScale={0.22} minScale={0.05} maxScale={6} centerOnInit>
              <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                <img src={result.url} alt="Generated Panorama" className="max-w-none shadow-2xl" />
              </TransformComponent>
            </TransformWrapper>
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/70 px-4 py-1 text-xs text-slate-300">
              ズームとパンで全体を確認できます
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/65 p-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Focus Boost (部分超高画質)</h3>
              <p className="mt-1 text-xs text-slate-400">下の画像でドラッグして領域を選択し、選択範囲のみ高精細化します。</p>
            </div>

            <div
              ref={sourceRef}
              className="relative overflow-hidden rounded-xl border border-white/15 bg-black"
              onPointerDown={beginSelection}
              onPointerMove={updateSelection}
              onPointerUp={endSelection}
              onPointerCancel={endSelection}
            >
              <img src={result.url} alt="Focus source" className="block w-full select-none" draggable={false} />
              {activeSelection && (
                <div
                  className="pointer-events-none absolute border-2 border-cyan-300 bg-cyan-300/20"
                  style={{
                    left: `${activeSelection.x * 100}%`,
                    top: `${activeSelection.y * 100}%`,
                    width: `${activeSelection.w * 100}%`,
                    height: `${activeSelection.h * 100}%`,
                  }}
                />
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/65 p-3 text-xs text-slate-300">
              {selection ? (
                <p>
                  選択範囲: {selectedPixelWidth} × {selectedPixelHeight}px
                </p>
              ) : (
                <p>まだ選択範囲がありません。</p>
              )}
            </div>

            <SettingSlider
              label="アップスケール倍率"
              min={1}
              max={6}
              step={0.25}
              value={upscaleFactor}
              onChange={setUpscaleFactor}
            />
            <SettingSlider
              label="ディテール補強"
              min={0.2}
              max={2}
              step={0.05}
              value={detailAmount}
              onChange={setDetailAmount}
            />
            <SettingSlider
              label="ノイズ低減"
              min={0}
              max={1}
              step={0.05}
              value={denoiseStrength}
              onChange={setDenoiseStrength}
            />

            <button
              onClick={boostFocusRegion}
              disabled={focusBusy}
              className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {focusBusy ? 'Focus Boost生成中...' : '選択領域を超高画質化'}
            </button>

            {focusError && <p className="text-xs text-rose-300">{focusError}</p>}

            {focusResult && (
              <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-3">
                <p className="text-xs text-emerald-100">
                  出力サイズ: {focusResult.width} × {focusResult.height}px ({formatMegaPixels(focusResult.width, focusResult.height)})
                </p>
                <img src={focusResult.url} alt="Focus boost output" className="mt-2 w-full rounded-lg border border-emerald-200/25" />
                <a
                  href={focusResult.url}
                  download="focus-boost.jpg"
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950"
                >
                  <Download className="h-3.5 w-3.5" />
                  Focus画像を保存
                </a>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
