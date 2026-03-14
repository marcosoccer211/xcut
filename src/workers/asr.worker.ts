import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any = null

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data

  if (type === 'LOAD') {
    // Already loaded — skip re-initialization
    if (transcriber) {
      self.postMessage({ type: 'LOADED' })
      return
    }
    self.postMessage({ type: 'STATUS', payload: 'Loading Whisper model...' })

    // Attempt 1: WebGPU + q4 (fastest)
    try {
      transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-small', {
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        device: 'webgpu' as any,
      })
      self.postMessage({ type: 'LOADED' })
      return
    } catch { /* WebGPU unavailable or failed, try CPU */ }

    // Attempt 2: CPU + q4
    try {
      transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-small', {
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
      })
      self.postMessage({ type: 'LOADED' })
      return
    } catch { /* q4 CPU failed, try full fp32 */ }

    // Attempt 3: CPU + fp32 (most compatible)
    try {
      transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-small', {
        dtype: 'fp32',
      })
      self.postMessage({ type: 'LOADED' })
    } catch (err) {
      self.postMessage({ type: 'ERROR', payload: `模型加载失败: ${String(err)}` })
    }
  }

  if (type === 'TRANSCRIBE') {
    // audioData is a Float32Array at 16 kHz — decoding/resampling done on main thread
    const { audioData, language, initialPrompt } = payload
    try {
      self.postMessage({ type: 'STATUS', payload: 'Transcribing...' })
      const result = await transcriber(audioData, {
        language: language || 'english',
        task: 'transcribe',
        initial_prompt: initialPrompt || '',
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        callback_function: (beams: any) => {
          self.postMessage({ type: 'PROGRESS', payload: beams })
        },
      })
      self.postMessage({ type: 'RESULT', payload: result })
    } catch (err) {
      self.postMessage({ type: 'ERROR', payload: String(err) })
    }
  }
}
