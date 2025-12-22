import type { OdFileObject } from '../../types'
import { FC, useState } from 'react' // 1. 引入 useState
import { useRouter } from 'next/router'
import Image from 'next/image'       // 2. 引入 Next.js Image 组件

import { PreviewContainer, DownloadBtnContainer } from './Containers'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { getStoredToken } from '../../utils/protectedRouteHandler'

const ImagePreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { asPath } = useRouter()
  const hashedToken = getStoredToken(asPath)

  // 3. 定义加载状态，默认为 true
  const [isLoading, setIsLoading] = useState(true)

  // 构建图片 URL
  const imageUrl = `/api/raw/?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`

  return (
    <>
      <PreviewContainer>
        <div className="relative mx-auto overflow-hidden rounded-lg"> 
          {/* overflow-hidden 很重要，因为模糊放大的时候图片可能会超出容器 */}
          
          <Image
            src={imageUrl}
            alt={file.name}
            width={file.image?.width || 800} // 需要提供宽高，如果没有元数据，给个默认值
            height={file.image?.height || 600}
            quality={90} // 图片质量，可选
            priority // 如果是首屏大图，建议加上 priority 属性
            
            // 4. 核心逻辑：利用 className 控制模糊和缩放
            // 正在加载：高斯模糊 + 灰度 + 稍微放大 (scale-110)
            // 加载完成：无模糊 + 无灰度 + 恢复原大小 (scale-100)
            className={`
              duration-700 ease-in-out group-hover:opacity-75
              ${
                isLoading
                  ? 'scale-110 blur-2xl grayscale'
                  : 'scale-100 blur-0 grayscale-0'
              }
            `}
            
            // 5. 监听加载完成事件 (注意：Next.js 13+ 使用 onLoad，旧版可能用 onLoadingComplete)
            onLoadingComplete={() => setIsLoading(false)} 
          />
        </div>
      </PreviewContainer>
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </>
  )
}

export default ImagePreview