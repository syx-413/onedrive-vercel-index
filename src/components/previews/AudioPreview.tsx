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
      
      const imageData = ctx.getImageData(
        canvas.width / 4,
        canvas.height / 4,
        canvas.width / 2,
        canvas.height / 2
      )
      
      const data = imageData.data
      let r = 0, g = 0, b = 0
      
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
      }
      
      const pixelCount = data.length / 4
      r = Math.floor(r / pixelCount)
      g = Math.floor(g / pixelCount)
      b = Math.floor(b / pixelCount)
      
      resolve(`rgb(${r}, ${g}, ${b})`)
    } else {
      resolve('rgb(239, 68, 68)')
    }
  })
}

// 判断是否为音频文件
const isAudioFile = (mimeType: string) => {
  return mimeType.startsWith('audio/')
}

// 解析LRC歌词格式
const parseLRC = (lrcText: string) => {
  const lines = lrcText.split('\n')
  const lyrics: Array<{ time: number; text: string }> = []
  
  lines.forEach(line => {
    // 匹配 [mm:ss.xx] 或 [mm:ss] 格式
    const match = line.match(/\[(\d{2}):(\d{2})\.?(\d{2,3})?\](.*)/)
    if (match) {
      const minutes = parseInt(match[1])
      const seconds = parseInt(match[2])
      const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0
      const time = minutes * 60 + seconds + milliseconds / 1000
      const text = match[4].trim()
      if (text) {
        lyrics.push({ time, text })
      }
    }
  })
  
  return lyrics.sort((a, b) => a.time - b.time)
}

const AudioPreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { t } = useTranslation()
  const { asPath } = useRouter()
  const hashedToken = getStoredToken(asPath)

  // 获取当前目录路径
  const currentPath = asPath.substring(0, asPath.lastIndexOf('/')) || '/'
  
  // 获取当前目录的所有文件（支持分页）
  const { data: folderData, size, setSize } = useProtectedSWRInfinite(currentPath)

  const rapRef = useRef<AudioPlayer>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [playerStatus, setPlayerStatus] = useState(PlayerState.Loading)
  const [playerVolume, setPlayerVolume] = useState(1)
  const [themeColor, setThemeColor] = useState('rgb(239, 68, 68)')
  const [currentFile, setCurrentFile] = useState<OdFileObject>(file)
  const [playlist, setPlaylist] = useState<Array<{ name: string; file: any }>>([])
  const [lyrics, setLyrics] = useState<Array<{ time: number; text: string }>>([])
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1)
  const [showLyrics, setShowLyrics] = useState(false)
  const [activeTab, setActiveTab] = useState<'playlist' | 'lyrics'>('playlist')
  const lyricContainerRef = useRef<HTMLDivElement>(null)

  const thumbnail = `/api/thumbnail/?path=${asPath}&size=medium${hashedToken ? `&odpt=${hashedToken}` : ''}`
  const [brokenThumbnail, setBrokenThumbnail] = useState(false)

  // 自动加载所有分页数据
  useEffect(() => {
    if (!folderData) return
    
    const responses: any[] = [].concat(...folderData)
    const lastResponse = responses[responses.length - 1]
    
    // 如果还有下一页且 next 不是 undefined，自动加载
    if (lastResponse?.next && lastResponse.next !== 'undefined') {
      setSize(size + 1)
    }
  }, [folderData, size, setSize])

  // 处理目录数据，提取音频文件列表
  useEffect(() => {
    if (!folderData) return
    
    const responses: any[] = [].concat(...folderData)
    
    // 检查是否还在加载中
    const lastResponse = responses[responses.length - 1]
    const isLoading = lastResponse?.next && lastResponse.next !== 'undefined'
    
    if (!isLoading) {
      const allFiles = [].concat(...responses.map((r: any) => r.folder?.value || []))
      
      // 筛选音频文件
      const audioFiles = allFiles.filter((f: any) => f.file && isAudioFile(f.file.mimeType))
      
      setPlaylist(audioFiles.map((f: any) => ({
        name: f.name,
        file: f,
      })))
    }
  }, [folderData])

  useEffect(() => {
    const rap = rapRef.current?.audio.current
    if (rap) {
      rap.oncanplay = () => setPlayerStatus(PlayerState.Ready)
      rap.onended = () => {
        // 自动播放下一首
        const currentIndex = playlist.findIndex(item => item.name === currentFile.name)
        if (currentIndex < playlist.length - 1) {
          handlePlaylistItemClick(playlist[currentIndex + 1].file)()
        } else {
          setPlayerStatus(PlayerState.Paused)
        }
      }
      rap.onpause = () => setPlayerStatus(PlayerState.Paused)
      rap.onplay = () => setPlayerStatus(PlayerState.Playing)
      rap.onplaying = () => setPlayerStatus(PlayerState.Playing)
      rap.onseeking = () => setPlayerStatus(PlayerState.Loading)
      rap.onwaiting = () => setPlayerStatus(PlayerState.Loading)
      rap.onerror = () => setPlayerStatus(PlayerState.Paused)
      rap.onvolumechange = () => setPlayerVolume(rap.volume)
    }
  }, [currentFile, playlist])

  const handleImageLoad = async () => {
    if (imgRef.current) {
      const color = await extractColorFromImage(imgRef.current)
      setThemeColor(color)
    }
  }

  // 处理播放列表项点击
  const handlePlaylistItemClick = (fileItem: any) => () => {
    setCurrentFile(fileItem)
    setBrokenThumbnail(false)
    setPlayerStatus(PlayerState.Loading)
  }

  // 获取并解析歌词
  useEffect(() => {
    const fetchLyrics = async () => {
      setLyrics([])
      setCurrentLyricIndex(-1)
      setShowLyrics(false)
      
      const lrcFileName = currentFile.name.replace(/\.[^.]+$/, '.lrc')
      const lrcPath = `${currentPath}/${encodeURIComponent(lrcFileName)}`
      
      try {
        const response = await fetch(`/api/raw/?path=${lrcPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`)
        if (response.ok) {
          const lrcText = await response.text()
          const parsedLyrics = parseLRC(lrcText)
          if (parsedLyrics.length > 0) {
            setLyrics(parsedLyrics)
            setShowLyrics(true)
          }
        }
      } catch (error) {
        // 没有歌词文件，保持隐藏
      }
    }
    
    fetchLyrics()
  }, [currentFile.name, currentPath, hashedToken])

  // 同步歌词显示
  useEffect(() => {
    if (lyrics.length === 0) return
    
    const rap = rapRef.current?.audio.current
    if (!rap) return

    const updateLyric = () => {
      const currentTime = rap.currentTime
      let index = -1
      
      for (let i = 0; i < lyrics.length; i++) {
        if (currentTime >= lyrics[i].time) {
          index = i
        } else {
          break
        }
      }
      
      if (index !== currentLyricIndex) {
        setCurrentLyricIndex(index)
        
        // 自动滚动到当前歌词
        if (lyricContainerRef.current && index >= 0) {
          const lyricElement = lyricContainerRef.current.children[index] as HTMLElement
          if (lyricElement) {
            lyricElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }
      }
    }

    const intervalId = setInterval(updateLyric, 100)
    return () => clearInterval(intervalId)
  }, [lyrics, currentLyricIndex])

  // 当前播放文件的路径
  const currentFilePath = `${currentPath}/${encodeURIComponent(currentFile.name)}`
  const currentThumbnail = `/api/thumbnail/?path=${currentFilePath}&size=medium${hashedToken ? `&odpt=${hashedToken}` : ''}`

  return (
    <>
      <PreviewContainer>
        <div className="flex flex-col lg:flex-row lg:space-x-6 space-y-6 lg:space-y-0" style={{ '--scroll-color': themeColor } as React.CSSProperties}>
          {/* 左侧：播放器主区域 */}
          <div className="lg:w-2/5 flex flex-col space-y-4">
            {/* 专辑封面 */}
            <div className="relative flex items-center justify-center">
              <div 
                className="absolute inset-0 rounded-2xl blur-3xl opacity-30"
                style={{ background: themeColor }}
              />
              
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl shadow-2xl">
                {/* 加载动画 */}
                <div
                  className={`absolute inset-0 z-20 flex items-center justify-center bg-gray-900 transition-opacity duration-300 ${
                    playerStatus === PlayerState.Loading ? 'opacity-90' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  <LoadingIcon className="h-8 w-8 animate-spin text-white" />
                </div>

                {/* 专辑封面 */}
                {!brokenThumbnail ? (
                  <img
                    ref={imgRef}
                    className={`h-full w-full object-cover transition-transform duration-500 ${
                      playerStatus === PlayerState.Playing ? 'scale-105' : 'scale-100'
                    }`}
                    src={currentThumbnail}
                    alt={currentFile.name}
                    onError={() => setBrokenThumbnail(true)}
                    onLoad={handleImageLoad}
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div 
                    className="flex h-full w-full items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${themeColor}, rgba(0,0,0,0.8))` }}
                  >
                    <FontAwesomeIcon
                      className={`h-16 w-16 text-white ${playerStatus === PlayerState.Playing ? 'animate-pulse' : ''}`}
                      icon="music"
                    />
                  </div>
                )}

                {/* 播放状态指示器 */}
                <div
                  className={`absolute bottom-4 right-4 rounded-full p-3 backdrop-blur-md transition-all duration-300 ${
                    playerStatus === PlayerState.Playing ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
                  }`}
                  style={{ backgroundColor: `${themeColor}40` }}
                >
                  <div className="flex space-x-1">
                    <div className="h-4 w-1 rounded-full bg-white animate-pulse" style={{ animationDelay: '0ms' }} />
                    <div className="h-4 w-1 rounded-full bg-white animate-pulse" style={{ animationDelay: '150ms' }} />
                    <div className="h-4 w-1 rounded-full bg-white animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* 歌曲信息 */}
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white line-clamp-2">{currentFile.name}</h2>
              <div className="flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400">
                <FontAwesomeIcon icon="clock" className="h-3 w-3" />
                <span>{formatModifiedDateTime(currentFile.lastModifiedDateTime)}</span>
              </div>
            </div>

            {/* 播放器控制 */}
            <div className="space-y-3">
              <AudioPlayer
                className="!bg-transparent !shadow-none"
                src={`/api/raw/?path=${currentFilePath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
                ref={rapRef}
                customProgressBarSection={[
                  RHAP_UI.CURRENT_TIME,
                  RHAP_UI.PROGRESS_BAR,
                  RHAP_UI.DURATION,
                ]}
                customAdditionalControls={[]}
                volume={0.7}
                autoPlay
                style={{
                  '--rhap-theme-color': themeColor,
                  '--rhap-bar-color': `${themeColor}40`,
                } as React.CSSProperties}
              />

              {/* 播放控制和状态 */}
              <div className="flex items-center justify-between rounded-xl bg-gray-100 dark:bg-gray-800/50 px-4 py-2.5 backdrop-blur-sm">
                <div className="flex items-center space-x-2">
                  <div 
                    className="h-2 w-2 rounded-full"
                    style={{ 
                      backgroundColor: themeColor,
                      animation: playerStatus === PlayerState.Playing ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none'
                    }}
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {playerStatus === PlayerState.Playing ? t('Playing') || '播放中' : 
                     playerStatus === PlayerState.Loading ? t('Loading') || '加载中' : 
                     t('Paused') || '已暂停'}
                  </span>
                </div>
                
                {playlist.length > 1 && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        const currentIndex = playlist.findIndex(item => item.name === currentFile.name)
                        if (currentIndex > 0) {
                          handlePlaylistItemClick(playlist[currentIndex - 1].file)()
                        }
                      }}
                      disabled={playlist.findIndex(item => item.name === currentFile.name) === 0}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title={t('Previous') || '上一首'}
                    >
                      <FontAwesomeIcon icon="chevron-left" className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                    </button>
                    
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium min-w-[50px] text-center">
                      {playlist.findIndex(item => item.name === currentFile.name) + 1} / {playlist.length}
                    </span>
                    
                    <button
                      onClick={() => {
                        const currentIndex = playlist.findIndex(item => item.name === currentFile.name)
                        if (currentIndex < playlist.length - 1) {
                          handlePlaylistItemClick(playlist[currentIndex + 1].file)()
                        }
                      }}
                      disabled={playlist.findIndex(item => item.name === currentFile.name) === playlist.length - 1}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title={t('Next') || '下一首'}
                    >
                      <FontAwesomeIcon icon="chevron-right" className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 右侧：标签页内容区域 */}
          <div className="lg:w-3/5 flex flex-col">
            <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden flex-1 flex flex-col">
              {/* 标签页导航 */}
              <div className="flex border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <button
                  onClick={() => setActiveTab('playlist')}
                  className={`flex-1 px-6 py-3 text-sm font-medium transition-colors relative ${
                    activeTab === 'playlist'
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <FontAwesomeIcon icon="list" className="h-4 w-4" />
                    <span>{t('Playlist') || '播放列表'}</span>
                    {playlist.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700">
                        {playlist.length}
                      </span>
                    )}
                  </div>
                  {activeTab === 'playlist' && (
                    <div 
                      className="absolute bottom-0 left-0 right-0 h-0.5"
                      style={{ backgroundColor: themeColor }}
                    />
                  )}
                </button>
                
                <button
                  onClick={() => setActiveTab('lyrics')}
                  className={`flex-1 px-6 py-3 text-sm font-medium transition-colors relative ${
                    activeTab === 'lyrics'
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <FontAwesomeIcon icon="file-lines" className="h-4 w-4" />
                    <span>{t('Lyrics') || '歌词'}</span>
                  </div>
                  {activeTab === 'lyrics' && (
                    <div 
                      className="absolute bottom-0 left-0 right-0 h-0.5"
                      style={{ backgroundColor: themeColor }}
                    />
                  )}
                </button>
              </div>

              {/* 标签页内容 */}
              <div className="flex-1 overflow-hidden">
                {/* 播放列表内容 */}
                {activeTab === 'playlist' && (
                  <div className="h-full overflow-y-auto custom-scrollbar">
                    {playlist.map((item, index) => {
                      const isCurrentTrack = item.name === currentFile.name
                      return (
                        <div
                          key={item.name}
                          onClick={handlePlaylistItemClick(item.file)}
                          className={`flex items-center space-x-3 px-4 py-3 cursor-pointer transition-all duration-200 border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${
                            isCurrentTrack 
                              ? 'bg-gradient-to-r from-gray-100 to-transparent dark:from-gray-800 dark:to-transparent' 
                              : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
                          }`}
                          style={isCurrentTrack ? {
                            borderLeft: `3px solid ${themeColor}`,
                          } : {}}
                        >
                          {/* 序号或播放图标 */}
                          <div className="w-6 text-center flex-shrink-0">
                            {isCurrentTrack && playerStatus === PlayerState.Playing ? (
                              <div className="flex space-x-0.5 justify-center">
                                <div className="w-0.5 h-3 rounded-full animate-pulse" style={{ backgroundColor: themeColor, animationDelay: '0ms' }} />
                                <div className="w-0.5 h-3 rounded-full animate-pulse" style={{ backgroundColor: themeColor, animationDelay: '150ms' }} />
                                <div className="w-0.5 h-3 rounded-full animate-pulse" style={{ backgroundColor: themeColor, animationDelay: '300ms' }} />
                              </div>
                            ) : (
                              <span className={`text-xs ${isCurrentTrack ? 'font-bold' : 'text-gray-500 dark:text-gray-400'}`}
                                style={isCurrentTrack ? { color: themeColor } : {}}>
                                {index + 1}
                              </span>
                            )}
                          </div>

                          {/* 音乐图标 */}
                          <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                            isCurrentTrack ? 'bg-gray-200 dark:bg-gray-700' : 'bg-gray-100 dark:bg-gray-800'
                          }`}
                            style={isCurrentTrack ? { backgroundColor: `${themeColor}20` } : {}}>
                            <FontAwesomeIcon 
                              icon="music" 
                              className={`h-3 w-3 ${isCurrentTrack ? '' : 'text-gray-400 dark:text-gray-500'}`}
                              style={isCurrentTrack ? { color: themeColor } : {}}
                            />
                          </div>

                          {/* 歌曲名称 */}
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm truncate ${isCurrentTrack ? 'font-semibold' : 'text-gray-700 dark:text-gray-300'}`}
                              style={isCurrentTrack ? { color: themeColor } : {}}>
                              {item.name}
                            </div>
                          </div>

                          {/* 正在播放标识 */}
                          {isCurrentTrack && (
                            <div className="flex-shrink-0">
                              <FontAwesomeIcon 
                                icon="volume-up" 
                                className="h-3 w-3"
                                style={{ color: themeColor }}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* 歌词内容 */}
                {activeTab === 'lyrics' && (
                  <div className="h-full overflow-y-auto p-6 custom-scrollbar" ref={lyricContainerRef}>
                    {showLyrics && lyrics.length > 0 ? (
                      <div className="space-y-4">
                        {lyrics.map((lyric, index) => (
                          <div
                            key={index}
                            className={`transition-all duration-300 text-center py-2 px-4 rounded-lg ${
                              index === currentLyricIndex
                                ? 'text-lg font-bold scale-110'
                                : 'text-sm opacity-50'
                            }`}
                            style={index === currentLyricIndex ? {
                              color: themeColor,
                            } : {}}
                          >
                            {lyric.text}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                        <FontAwesomeIcon icon="music" className="h-16 w-16 mb-4 opacity-20" />
                        <p className="text-sm">{t('No lyrics available') || '暂无歌词'}</p>
                        <p className="text-xs mt-2 text-center px-8">
                          {t('Place a .lrc file with the same name as the audio file') || '请在同目录下放置同名的 .lrc 歌词文件'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </PreviewContainer>

      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
        
        /* 自定义滚动条样式 */
        .custom-scrollbar::-webkit-scrollbar {
          width: 12px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(229, 231, 235, 0.5);
          border-radius: 6px;
          margin: 4px;
        }
        
        .dark .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(55, 65, 81, 0.5);
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: ${themeColor};
          border-radius: 6px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: ${themeColor};
          border: 1px solid transparent;
          background-clip: padding-box;
        }
        
        /* Firefox 滚动条 */
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: ${themeColor} rgba(229, 231, 235, 0.5);
        }
        
        .dark .custom-scrollbar {
          scrollbar-color: ${themeColor} rgba(55, 65, 81, 0.5);
        }
      `}</style>
    </>
  )
}

export default AudioPreview