"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullableBytesFieldUpdateOperationsInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GraphQLScalars = tslib_1.__importStar(require("graphql-scalars"));
let NullableBytesFieldUpdateOperationsInput = class NullableBytesFieldUpdateOperationsInput {
};
exports.NullableBytesFieldUpdateOperationsInput = NullableBytesFieldUpdateOperationsInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => GraphQLScalars.ByteResolver, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Buffer)
], NullableBytesFieldUpdateOperationsInput.prototype, "set", void 0);
exports.NullableBytesFieldUpdateOperationsInput = NullableBytesFieldUpdateOperationsInput = tslib_1.__decorate([
    TypeGraphQL.InputType("NullableBytesFieldUpdateOperationsInput", {})
], NullableBytesFieldUpdateOperationsInput);
