export class CameraManager {
  private currentStream: MediaStream | null = null;

  async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.enumerateDevices) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'videoinput');
  }

  async startCamera(deviceId?: string): Promise<MediaStream> {
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      throw new Error('Camera API is not available in this context.');
    }

    const constraints: MediaStreamConstraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: 'user' },
      audio: false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.currentStream = stream;
      return stream;
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          throw new Error('Camera permission was denied.');
        }
        if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          throw new Error('No camera device was found.');
        }
        if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          throw new Error('Camera is already in use or could not be accessed.');
        }
      }
      throw error;
    }
  }

  async switchCamera(deviceId: string): Promise<MediaStream> {
    this.stopCamera();
    return this.startCamera(deviceId);
  }

  stopCamera(): void {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((track) => track.stop());
      this.currentStream = null;
    }
  }

  captureFrame(videoElement: HTMLVideoElement): ImageData {
    const { videoWidth, videoHeight } = videoElement;

    if (videoWidth === 0 || videoHeight === 0) {
      throw new Error('Video element has no dimensions. Ensure the video is playing.');
    }

    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(videoWidth, videoHeight);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not acquire 2D rendering context from OffscreenCanvas.');
      }
      ctx.drawImage(videoElement, 0, 0, videoWidth, videoHeight);
      return ctx.getImageData(0, 0, videoWidth, videoHeight);
    }

    if (typeof document === 'undefined') {
      throw new Error('Canvas APIs are not available in this context.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoWidth;
    canvas.height = videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not acquire 2D rendering context from Canvas.');
    }
    ctx.drawImage(videoElement, 0, 0, videoWidth, videoHeight);
    return ctx.getImageData(0, 0, videoWidth, videoHeight);
  }
}

export default CameraManager;
