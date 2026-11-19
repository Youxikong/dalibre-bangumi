# Dalibre Bangumi 插件

此插件通过 Bangumi API 为 Dalibre 的书籍补充元数据。它会按标题搜索条目，也支持使用 `bgm` 标识符直接查询；搜索时还会检查关联的书籍条目。代码逻辑基于[calibre-bangumi](https://github.com/Cusox/calibre-bangumi)由ai改下，还未经过人工审核，请慎用。

可获取的信息包括中文标题、作者、标签、出版日期、出版社、ISBN、简介和封面。插件不提供书籍文件下载。

## 插件选项

- **搜索主条目结果数量**：搜索时请求的最多结果数，默认 `5`。
- **过滤后的最大结果数量**：排序后返回的最多候选数，默认 `10`。
- **有效标签的最小打标签人数**：标签至少需要达到的人数，默认 `5`。
- **最大标签数量**：每个条目最多保留的标签数，默认 `10`。

## 开发

插件使用 Dalibre Plugin API 1。API 文档和类型可通过 Dalibre CLI 查看：

```sh
npx dalibre-plugin@latest docs
npx dalibre-plugin@latest types
```
## TODO

- [ ] 单行本的系列信息填充。