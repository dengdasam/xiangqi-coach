cmake_minimum_required(VERSION 3.22.1)
project("xiangqi-coach-engine")

# 原生引擎桥 JNI 库
add_library(native-engine SHARED native-engine.cpp)

find_library(log-lib log)
target_link_libraries(native-engine ${log-lib})

# 接入真引擎时，在此处追加 Pikafish 源码：
#   add_subdirectory(pikafish)
#   target_link_libraries(native-engine pikafish)
# 或将预编译的 libpikafish.so 放入 jniLibs/${ANDROID_ABI}/ 并在 Gradle 中打包。
