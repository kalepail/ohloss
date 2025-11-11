default: build

all: test

build:
	stellar contract build

optimize: build
	stellar contract optimize --wasm target/wasm32v1-none/release/blendizzard.wasm
	stellar contract optimize --wasm target/wasm32v1-none/release/number_guess.wasm

test: build
	cargo test

fmt:
	cargo fmt --all

clean:
	cargo clean

bindings:
	stellar contract bindings typescript \
		--wasm target/wasm32v1-none/release/blendizzard.wasm \
		--output-dir ./bunt/bindings/blendizzard \
		--overwrite
	stellar contract bindings typescript \
		--output-dir ./bunt/bindings/fee-vault \
		--contract-id CBBY53VYJSMAWCBZZ7BHJZ5XSZNJUS4ZE6Q4RN7TKZGHPYHMEE467W7Y \
		--overwrite
	stellar contract bindings typescript \
		--wasm target/wasm32v1-none/release/number_guess.wasm \
		--output-dir ./bunt/bindings/number-guess \
		--overwrite