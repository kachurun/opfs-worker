import { isAudioPath, isImagePath, isPdfPath, isVideoPath } from '../../lib/format';

export type MediaMode = 'image' | 'video' | 'audio' | 'pdf';

export function mediaModeFor(path: string): MediaMode | null {
    if (isImagePath(path)) {
        return 'image';
    }

    if (isVideoPath(path)) {
        return 'video';
    }

    if (isAudioPath(path)) {
        return 'audio';
    }

    if (isPdfPath(path)) {
        return 'pdf';
    }

    return null;
}
