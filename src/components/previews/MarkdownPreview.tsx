import { FC, CSSProperties, ReactNode, useState, useEffect } from 'react' // 务必引入 useEffect
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import { useTranslation } from 'next-i18next'
import useSystemTheme from 'react-use-system-theme'
import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { prism, oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import axios from 'axios' // 引入 axios，与 useFileContent 保持一致

import 'katex/dist/katex.min.css'

import useFileContent from '../../utils/fetchOnMount'
import { getStoredToken } from '../../utils/protectedRouteHandler'
import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'

// ... ImagePreviewModal 组件保持不变 ...
const ImagePreviewModal: FC<{
  src: string
  alt?: string
  onClose: () => void
}> = ({ src, alt, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
        aria-label="Close preview"
      >
        <FontAwesomeIcon icon="times" className="h-8 w-8" />
      </button>
      
      <div className="relative max-w-7xl max-h-full" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={alt || ''}
          className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
        />
        {alt && (
          <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white p-4 rounded-b-lg">
            <p className="text-center text-sm">{alt}</p>
          </div>
        )}
      </div>
      
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm opacity-70">
        <FontAwesomeIcon icon="search-minus" className="mr-2" />
        点击图片外区域关闭
      </div>
    </div>
  )
}

// 彻底重写的图片组件：使用 axios 获取 Blob
const MarkdownImage: FC<{
  src?: string
  alt?: string
  title?: string
  width?: string | number
  height?: string | number
  style?: CSSProperties
  parentPath: string
}> = ({ src, alt, title, width, height, style, parentPath }) => {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [imgDataUrl, setImgDataUrl] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  const isUrlAbsolute = (url: string) => url.indexOf('://') > 0 || url.indexOf('//') === 0

  useEffect(() => {
    let active = true
    const fetchImage = async () => {
      // 1. 如果是外链，直接显示
      if (isUrlAbsolute(src as string)) {
        setImgDataUrl(src as string)
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        
        // 2. 构造请求路径
        // 注意：这里我们尝试对每一层目录都查找 Token，或者直接使用父目录的 Token
        // 为了保险，我们先尝试直接用 parentPath 的 Token
        const hashedToken = getStoredToken(parentPath)
        
        // 构造 API 地址
        const apiPath = `/api/?path=${parentPath}/${src}&raw=true${hashedToken ? `&odpt=${hashedToken}` : ''}`

        // 3. 使用 Axios 请求 (responseType: 'blob')
        const response = await axios.get(apiPath, { 
          responseType: 'blob',
          validateStatus: (status) => status >= 200 && status < 400 // 防止 304 被当做错误
        })

        if (active) {
          const objectUrl = URL.createObjectURL(response.data)
          setImgDataUrl(objectUrl)
          setIsLoading(false)
        }
      } catch (err) {
        console.error('Image load failed:', err)
        if (active) {
          // 如果 axios 失败，作为最后的手段，尝试直接构建 URL
          // 这在某些极端缓存情况下可能有效
          const hashedToken = getStoredToken(parentPath)
          const fallbackUrl = `/api/?path=${parentPath}/${src}&raw=true${hashedToken ? `&odpt=${hashedToken}` : ''}`
          setImgDataUrl(fallbackUrl)
          // 不设置 isLoading(false)，交给 img 标签的 onError 处理
        }
      }
    }

    fetchImage()

    return () => {
      active = false
      if (imgDataUrl && imgDataUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imgDataUrl)
      }
    }
  }, [src, parentPath])

  if (imageError) {
    return (
      <div className="my-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-center">
        <FontAwesomeIcon icon="image" className="h-8 w-8 text-red-400 mb-2" />
        <p className="text-sm text-red-600 dark:text-red-400">图片加载失败</p>
        <p className="text-xs text-gray-400">{src}</p>
      </div>
    )
  }

  return (
    <>
      <div className="my-6 flex flex-col items-center">
        {/* 加载中状态 */}
        {isLoading && !imgDataUrl && (
          <div className="w-full h-48 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse flex items-center justify-center">
             <FontAwesomeIcon icon="spinner" spin className="text-gray-400 h-8 w-8" />
          </div>
        )}

        <div 
          className={`relative group cursor-zoom-in max-w-full overflow-hidden rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 ${isLoading ? 'hidden' : 'block'}`}
          onClick={() => setPreviewOpen(true)}
        >
          <img
            src={imgDataUrl}
            alt={alt || ''}
            title={title}
            width={width}
            height={height}
            style={style}
            onLoad={() => setIsLoading(false)}
            onError={() => {
               setIsLoading(false)
               setImageError(true)
            }}
            className="max-w-full h-auto object-contain transition-transform duration-300 group-hover:scale-105"
          />
           {/* 悬停提示 */}
           <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-300 flex items-center justify-center pointer-events-none">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white dark:bg-gray-800 px-4 py-2 rounded-full shadow-lg">
              <FontAwesomeIcon icon="search-plus" className="mr-2 text-gray-700 dark:text-gray-300" />
              <span className="text-sm text-gray-700 dark:text-gray-300">点击查看大图</span>
            </div>
          </div>
        </div>
        
        {(alt || title) && !imageError && (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 text-center max-w-2xl italic">
            {alt || title}
          </p>
        )}
      </div>

      {previewOpen && (
        <ImagePreviewModal
          src={imgDataUrl}
          alt={alt}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  )
}

// ... MarkdownPreview 主组件保持不变 ...
const MarkdownPreview: FC<{
  file: any
  path: string
  standalone?: boolean
}> = ({ file, path, standalone = true }) => {
  const theme = useSystemTheme('dark')
  const parentPath = standalone ? path.substring(0, path.lastIndexOf('/')) : path

  const { response: content, error, validating } = useFileContent(`/api/raw/?path=${parentPath}/${file.name}`, path)
  const { t } = useTranslation()

  // Custom renderer:
  const customRenderer = {
    img: (props: {
      alt?: string
      src?: string
      title?: string
      width?: string | number
      height?: string | number
      style?: CSSProperties
    }) => {
      return <MarkdownImage {...props} parentPath={parentPath} />
    },
    
    code({
      className,
      children,
      inline,
      ...props
    }: {
      className?: string | undefined
      children: ReactNode
      inline?: boolean
    }) {
      if (inline) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        )
      }

      const match = /language-(\w+)/.exec(className || '')
      return (
        <SyntaxHighlighter 
          language={match ? match[1] : 'text'} 
          style={theme === 'dark' ? oneDark : prism} 
          PreTag="div" 
          showLineNumbers={true}
          wrapLines={true}
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      )
    },
  }

  if (error) {
    return (
      <PreviewContainer>
        <FourOhFour errorMsg={error} />
      </PreviewContainer>
    )
  }
  
  if (validating) {
    return (
      <>
        <PreviewContainer>
          <Loading loadingText={t('Loading file content...')} />
        </PreviewContainer>
        {standalone && (
          <DownloadBtnContainer>
            <DownloadButtonGroup />
          </DownloadBtnContainer>
        )}
      </>
    )
  }

  return (
    <div>
      <PreviewContainer>
        <div className="markdown-body">
          <ReactMarkdown
            // @ts-ignore
            remarkPlugins={[remarkGfm, remarkMath]}
            // @ts-ignore
            rehypePlugins={[rehypeKatex, rehypeRaw]}
            components={customRenderer}
          >
            {content}
          </ReactMarkdown>
        </div>
      </PreviewContainer>
      {standalone && (
        <DownloadBtnContainer>
          <DownloadButtonGroup />
        </DownloadBtnContainer>
      )}
    </div>
  )
}

export default MarkdownPreview