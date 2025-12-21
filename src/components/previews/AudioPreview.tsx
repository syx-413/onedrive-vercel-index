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
      
      // 采样图片中心区域的颜色
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
      resolve('rgb(239, 68, 68)') // 默认红色
    }
  })
}

const AudioPreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { t } = useTranslation()
  const { asPath } = useRouter()
  const hashedToken = getStoredToken(asPath)

  const rapRef = useRef<AudioPlayer>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [playerStatus, setPlayerStatus] = useState(PlayerState.Loading)
  const [playerVolume, setPlayerVolume] = useState(1)
  const [themeColor, setThemeColor] = useState('rgb(239, 68, 68)')

  const thumbnail = `/api/thumbnail/?path=${asPath}&size=medium${hashedToken ? `&odpt=${hashedToken}` : ''}`
  const [brokenThumbnail, setBrokenThumbnail] = useState(false)

  useEffect(() => {
    const rap = rapRef.current?.audio.current
    if (rap) {
      rap.oncanplay = () => setPlayerStatus(PlayerState.Ready)
      rap.onended = () => setPlayerStatus(PlayerState.Paused)
      rap.onpause = () => setPlayerStatus(PlayerState.Paused)
      rap.onplay = () => setPlayerStatus(PlayerState.Playing)
      rap.onplaying = () => setPlayerStatus(PlayerState.Playing)
      rap.onseeking = () => setPlayerStatus(PlayerState.Loading)
      rap.onwaiting = () => setPlayerStatus(PlayerState.Loading)
      rap.onerror = () => setPlayerStatus(PlayerState.Paused)
      rap.onvolumechange = () => setPlayerVolume(rap.volume)
    }
  }, [])

  // 当图片加载完成后提取颜色
  const handleImageLoad = async () => {
    if (imgRef.current) {
      const color = await extractColorFromImage(imgRef.current)
      setThemeColor(color)
    }
  }

  return (
    <>
      <PreviewContainer>
        <div className="flex flex-col space-y-6 md:flex-row md:space-x-8 md:space-y-0">
          {/* 专辑封面区域 */}
          <div className="relative flex w-full items-center justify-center md:w-80">
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
                  src={thumbnail}
                  alt={file.name}
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

          {/* 播放器控制区域 */}
          <div className="flex flex-1 flex-col justify-between space-y-6">
            {/* 歌曲信息 */}
            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-white line-clamp-2">{file.name}</h2>
              <div className="flex items-center space-x-3 text-sm text-gray-400">
                <span className="flex items-center space-x-2">
                  <FontAwesomeIcon icon="clock" className="h-3 w-3" />
                  <span>{formatModifiedDateTime(file.lastModifiedDateTime)}</span>
                </span>
              </div>
            </div>

            {/* 自定义播放器样式 */}
            <div className="space-y-4">
              <AudioPlayer
                className="!bg-transparent !shadow-none"
                src={`/api/raw/?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
                ref={rapRef}
                customProgressBarSection={[
                  RHAP_UI.CURRENT_TIME,
                  RHAP_UI.PROGRESS_BAR,
                  RHAP_UI.DURATION,
                ]}
                customAdditionalControls={[]}
                volume={0.7}
                autoPlay
                loop={true}
                style={{
                  '--rhap-theme-color': themeColor,
                  '--rhap-bar-color': `${themeColor}40`,
                } as React.CSSProperties}
              />

              {/* 音量控制 */}
              <div className="flex items-center space-x-3 rounded-xl bg-gray-800/50 px-4 py-3 backdrop-blur-sm">
                <FontAwesomeIcon 
                  icon={playerVolume > 0 ? "volume-up" : "volume-mute"} 
                  className="h-4 w-4 text-gray-400"
                />
                <div className="flex-1 h-1 rounded-full bg-gray-700">
                  <div 
                    className="h-full rounded-full transition-all duration-200"
                    style={{ 
                      width: `${playerVolume * 100}%`,
                      backgroundColor: themeColor
                    }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-8 text-right">
                  {Math.round(playerVolume * 100)}%
                </span>
              </div>

              {/* 播放状态信息 */}
              <div className="flex items-center justify-between rounded-xl bg-gray-800/50 px-4 py-3 backdrop-blur-sm">
                <div className="flex items-center space-x-2">
                  <div 
                    className="h-2 w-2 rounded-full"
                    style={{ 
                      backgroundColor: themeColor,
                      animation: playerStatus === PlayerState.Playing ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none'
                    }}
                  />
                  <span className="text-sm text-gray-400">
                    {playerStatus === PlayerState.Playing ? t('Playing') || '播放中' : 
                     playerStatus === PlayerState.Loading ? t('Loading') || '加载中' : 
                     t('Paused') || '已暂停'}
                  </span>
                </div>
                <FontAwesomeIcon 
                  icon="infinity" 
                  className="h-4 w-4 text-gray-400"
                  title={t('Loop') || '循环播放'}
                />
              </div>
            </div>
          </div>
        </div>
      </PreviewContainer>

      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </>
  )
}

export default AudioPreview