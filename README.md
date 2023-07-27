# vue2文件跳转

## Features

* 支持vue2模版跳转到vue文件，例如在`import app from './app'`选中app然后按下`f12`会跳转到app.vue文件
* 支持别名，会读取根目录下的`jsconfig.json`和`tsconfig.json`文件，可以根据配置的别名跳转到对应的文件
* 不会污染vscode的原生跳转功能，只是针对vue文件，vscode本身支持跳转时不会提示多个定义。
