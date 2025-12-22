import type { OdFileObject } from '../../types'
import { FC, useEffect, useRef, useState } from 'react'

import AudioPlayer, { RHAP_UI } from 'react-h5-audio-player'
import 'react-h5-audio-player/lib/styles.css'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useTranslation } from 'next-i18next'
import { useRouter } from 'next/router'

import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'
import { LoadingIcon } from '../Loading'
import { formatModifiedDateTime } from '../../utils/fileDetails'
import { getStoredToken } from '../../utils/protectedRouteHandler'
import { useProtectedSWRInfinite } from '../../utils/fetchWithSWR'

enum PlayerState {
  Loading,
  Ready,
  Playing,
  Paused,
}

// 从图片提取主要颜色的工具函数
const extractColorFromImage = (imgElement: HTMLImageElement): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = imgElement.width
    canvas.height = imgElement.height
    if (ctx) {
      ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(canvas.width / 4, canvas.height / 4, canvas.width / 2, canvas.height / 2)
      const data = imageData.data
      let r = 0, g = 0, b = 0
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2]
      }
      const pixelCount = data.length / 4
      r = Math.floor(r / pixelCount); g = Math.floor(g / pixelCount); b = Math.floor(b / pixelCount)
      resolve(`rgb(${r}, ${g}, ${b})`)
    } else {
      resolve('rgb(239, 68, 68)')
    }
  })
}

const isAudioFile = (mimeType: string) => mimeType.startsWith('audio/')

const parseLRC = (lrcText: string) => {
  const lines = lrcText.split('\n')
  const lyrics: Array<{ time: number; text: string }> = []
  lines.forEach(line => {
    const match = line.match(/\[(\d{2}):(\d{2})\.?(\d{2,3})?\](.*)/)
    if (match) {
      const minutes = parseInt(match[1])
      const seconds = parseInt(match[2])
      const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0
      const time = minutes * 60 + seconds + milliseconds / 1000
      const text = match[4].trim()
      if (text) lyrics.push({ time, text })
    }
  })
  return lyrics.sort((a, b) => a.time - b.time)
}

const AudioPreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { t } = useTranslation()
  const { asPath } = useRouter()
  const hashedToken = getStoredToken(asPath)
  const currentPath = asPath.substring(0, asPath.lastIndexOf('/')) || '/'
  const { data: folderData, size, setSize } = useProtectedSWRInfinite(currentPath)

  const rapRef = useRef<AudioPlayer>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const lyricContainerRef = useRef<HTMLDivElement>(null)

  const [playerStatus, setPlayerStatus] = useState(PlayerState.Loading)
  const [themeColor, setThemeColor] = useState('rgb(239, 68, 68)')
  const [currentFile, setCurrentFile] = useState<OdFileObject>(file)
  const [playlist, setPlaylist] = useState<Array<{ name: string; file: any }>>([])
  const [lyrics, setLyrics] = useState<Array<{ time: number; text: string }>>([])
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1)
  const [activeTab, setActiveTab] = useState<'playlist' | 'lyrics'>('playlist')
  const [brokenThumbnail, setBrokenThumbnail] = useState(false)

  // 1. 自动加载分页数据
  useEffect(() => {
    if (!folderData) return
    const responses: any[] = [].concat(...folderData)
    const lastResponse = responses[responses.length - 1]
    if (lastResponse?.next && lastResponse.next !== 'undefined') {
      setSize(size + 1)
    }
  }, [folderData, size, setSize])

  // 2. 提取音频文件列表
  useEffect(() => {
    if (!folderData) return
    const responses: any[] = [].concat(...folderData)
    const lastResponse = responses[responses.length - 1]
    if (!(lastResponse?.next && lastResponse.next !== 'undefined')) {
      const allFiles = [].concat(...responses.map((r: any) => r.folder?.value || []))
      const audioFiles = allFiles.filter((f: any) => f.file && isAudioFile(f.file.mimeType))
      setPlaylist(audioFiles.map((f: any) => ({ name: f.name, file: f })))
    }
  }, [folderData])

  // 3. 播放器事件监听
  useEffect(() => {
    const rap = rapRef.current?.audio.current
    if (rap) {
      rap.oncanplay = () => setPlayerStatus(PlayerState.Ready)
      rap.onended = () => {
        const idx = playlist.findIndex(item => item.name === currentFile.name)
        if (idx < playlist.length - 1) handlePlaylistItemClick(playlist[idx + 1].file)()
      }
      rap.onpause = () => setPlayerStatus(PlayerState.Paused)
      rap.onplay = () => setPlayerStatus(PlayerState.Playing)
      rap.onwaiting = () => setPlayerStatus(PlayerState.Loading)
    }
  }, [currentFile, playlist])

  // 4. 获取歌词
  useEffect(() => {
    const fetchLyrics = async () => {
      setLyrics([]); setCurrentLyricIndex(-1)
      const lrcFileName = currentFile.name.replace(/\.[^.]+$/, '.lrc')
      const lrcPath = `${currentPath}/${encodeURIComponent(lrcFileName)}`
      try {
        const res = await fetch(`/api/raw/?path=${lrcPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`)
        if (res.ok) setLyrics(parseLRC(await res.text()))
      } catch (e) { }
    }
    fetchLyrics()
  }, [currentFile.name, currentPath, hashedToken])

  // 5. 歌词同步滚动
  useEffect(() => {
    const rap = rapRef.current?.audio.current
    if (!rap || lyrics.length === 0) return
    const updateLyric = () => {
      const time = rap.currentTime
      let index = lyrics.findLastIndex(l => time >= l.time)
      if (index !== currentLyricIndex) {
        setCurrentLyricIndex(index)
        if (lyricContainerRef.current && index >= 0) {
          (lyricContainerRef.current.children[index] as HTMLElement)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
    }
    const id = setInterval(updateLyric, 100)
    return () => clearInterval(id)
  }, [lyrics, currentLyricIndex])

  const handlePlaylistItemClick = (fileItem: any) => () => {
    setCurrentFile(fileItem)
    setBrokenThumbnail(false)
    setPlayerStatus(PlayerState.Loading)
  }

  const handleImageLoad = async () => {
    if (imgRef.current) setThemeColor(await extractColorFromImage(imgRef.current))
  }

  const currentFilePath = `${currentPath}/${encodeURIComponent(currentFile.name)}`
  const currentThumbnail = `/api/thumbnail/?path=${currentFilePath}&size=medium${hashedToken ? `&odpt=${hashedToken}` : ''}`

  return (
    <>
      <PreviewContainer>
        <div className="flex flex-col space-y-6" style={{ '--theme-color': themeColor } as React.CSSProperties}>

          {/* 上方区域：封面与控制 */}
          <div className="flex flex-col md:flex-row items-center md:items-start space-y-6 md:space-y-0 md:space-x-8 p-2">
            {/* 封面图 */}
            <div className="relative w-48 h-48 md:w-64 md:h-64 flex-shrink-0">
              <div className="absolute inset-0 rounded-3xl blur-2xl opacity-40" style={{ backgroundColor: themeColor }} />
              <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl bg-gray-800">
                <div className={`absolute inset-0 z-10 flex items-center justify-center bg-black/50 transition-opacity ${playerStatus === PlayerState.Loading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                  <LoadingIcon className="h-8 w-8 animate-spin text-white" />
                </div>
                {!brokenThumbnail ? (
                  <img
                    ref={imgRef}
                    src={currentThumbnail}
                    alt={currentFile.name}
                    className={`w-full h-full object-cover transition-transform duration-700 ${playerStatus === PlayerState.Playing ? 'scale-110' : 'scale-100'}`}
                    onLoad={handleImageLoad}
                    onError={() => setBrokenThumbnail(true)}
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                    <FontAwesomeIcon icon="music" className="text-white text-5xl opacity-50" />
                  </div>
                )}
              </div>
            </div>

            {/* 右侧信息与进度条 */}
            <div className="flex-1 w-full flex flex-col justify-center space-y-4">
              <div className="text-center md:text-left">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white line-clamp-2">{currentFile.name}</h2>
                <p className="text-sm text-gray-500 mt-2">
                  <FontAwesomeIcon icon="calendar-alt" className="mr-2" />
                  {formatModifiedDateTime(currentFile.lastModifiedDateTime)}
                </p>
              </div>

              <AudioPlayer
                ref={rapRef}
                src={`/api/raw/?path=${currentFilePath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
                className="!bg-transparent !shadow-none !p-0"
                layout="stacked-reverse"
                customAdditionalControls={[]}
                autoPlay
                style={{ '--rhap-theme-color': themeColor } as React.CSSProperties}
              />

              <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-2xl px-6 py-3">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${playerStatus === PlayerState.Playing ? 'animate-pulse' : ''}`} style={{ backgroundColor: themeColor }} />
                  <span className="text-xs font-medium uppercase tracking-wider opacity-70">
                    {playerStatus === PlayerState.Playing ? 'Playing' : playerStatus === PlayerState.Loading ? 'Loading' : 'Paused'}
                  </span>
                </div>
                {playlist.length > 1 && (
                  <div className="flex items-center space-x-4">
                    <button
                      disabled={playlist.findIndex(i => i.name === currentFile.name) === 0}
                      onClick={() => handlePlaylistItemClick(playlist[playlist.findIndex(i => i.name === currentFile.name) - 1].file)()}
                      className="hover:scale-110 disabled:opacity-30 transition-transform"
                    >
                      <FontAwesomeIcon icon="step-backward" />
                    </button>
                    <span className="text-xs font-mono font-bold">
                      {playlist.findIndex(i => i.name === currentFile.name) + 1} / {playlist.length}
                    </span>
                    <button
                      disabled={playlist.findIndex(i => i.name === currentFile.name) === playlist.length - 1}
                      onClick={() => handlePlaylistItemClick(playlist[playlist.findIndex(i => i.name === currentFile.name) + 1].file)()}
                      className="hover:scale-110 disabled:opacity-30 transition-transform"
                    >
                      <FontAwesomeIcon icon="step-forward" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 下方区域：列表与歌词 (固定高度) */}
          <div className="w-full bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col h-[450px]">
            {/* Tab 切换 */}
            {/* Tab 切换 */}
            <div className="flex bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setActiveTab('playlist')}
                // 关键点：添加了 relative 确保下划线只在按钮内部显示
                className={`relative flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'playlist' ? 'text-gray-900 dark:text-white' : 'text-gray-400'
                  }`}
              >
                <FontAwesomeIcon icon="list-ul" className="mr-2" />
                {t('Playlist')}
                {/* 确保这里有 activeTab 判断 */}
                {activeTab === 'playlist' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 z-10" style={{ backgroundColor: themeColor }} />
                )}
              </button>

              <button
                onClick={() => setActiveTab('lyrics')}
                // 关键点：添加了 relative
                className={`relative flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'lyrics' ? 'text-gray-900 dark:text-white' : 'text-gray-400'
                  }`}
              >
                <FontAwesomeIcon icon="quote-right" className="mr-2" />
                {t('Lyrics')}
                {activeTab === 'lyrics' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 z-10" style={{ backgroundColor: themeColor }} />
                )}
              </button>
            </div>


            {/* 内容滚动区 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {activeTab === 'playlist' ? (
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  {playlist.map((item, idx) => {
                    const active = item.name === currentFile.name
                    return (
                      <div
                        key={item.name}
                        onClick={handlePlaylistItemClick(item.file)}
                        className={`group flex items-center p-4 cursor-pointer transition-colors ${active ? 'bg-gray-50 dark:bg-gray-800/50' : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'}`}
                      >
                        <div className="w-8 text-xs font-mono opacity-40">{String(idx + 1).padStart(2, '0')}</div>
                        <div className={`flex-1 text-sm truncate ${active ? 'font-bold' : ''}`} style={{ color: active ? themeColor : '' }}>
                          {item.name}
                        </div>
                        {active && <FontAwesomeIcon icon="volume-up" className="animate-bounce" style={{ color: themeColor }} />}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="p-8 space-y-6 text-center" ref={lyricContainerRef}>
                  {lyrics.length > 0 ? (
                    lyrics.map((l, i) => (
                      <p
                        key={i}
                        className={`transition-all duration-500 ${i === currentLyricIndex ? 'text-xl font-bold scale-105' : 'text-base opacity-30'}`}
                        style={{ color: i === currentLyricIndex ? themeColor : '' }}
                      >
                        {l.text}
                      </p>
                    ))
                  ) : (
                    <div className="py-20 opacity-20 text-center">
                      <FontAwesomeIcon icon="compact-disc" className="text-6xl mb-4 animate-spin-slow" />
                      <p>{t('No lyrics available')}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </PreviewContainer>

      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>

      <style jsx global>{`
        .rhap_container { padding: 0 !important; }
        .rhap_progress-bar { height: 6px !important; }
        .rhap_main-controls-button { color: var(--theme-color) !important; }
        .rhap_progress-filled { background-color: var(--theme-color) !important; }
        .rhap_download-progress { background-color: rgba(0,0,0,0.1) !important; }
        .dark .rhap_download-progress { background-color: rgba(255,255,255,0.1) !important; }
        
        .animate-spin-slow { animation: spin 8s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: var(--theme-color); 
          border-radius: 10px;
          opacity: 0.5;
        }
      `}</style>
    </>
  )
}

export default AudioPreview
