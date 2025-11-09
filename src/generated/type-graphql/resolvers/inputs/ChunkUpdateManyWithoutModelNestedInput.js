"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkUpdateManyWithoutModelNestedInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkScalarWhereInput_1 = require("../inputs/ChunkScalarWhereInput");
const ChunkUpdateManyWithWhereWithoutModelInput_1 = require("../inputs/ChunkUpdateManyWithWhereWithoutModelInput");
const ChunkUpdateWithWhereUniqueWithoutModelInput_1 = require("../inputs/ChunkUpdateWithWhereUniqueWithoutModelInput");
const ChunkWhereUniqueInput_1 = require("../inputs/ChunkWhereUniqueInput");
let ChunkUpdateManyWithoutModelNestedInput = class ChunkUpdateManyWithoutModelNestedInput {
};
exports.ChunkUpdateManyWithoutModelNestedInput = ChunkUpdateManyWithoutModelNestedInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereUniqueInput_1.ChunkWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkUpdateManyWithoutModelNestedInput.prototype, "set", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereUniqueInput_1.ChunkWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkUpdateManyWithoutModelNestedInput.prototype, "disconnect", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereUniqueInput_1.ChunkWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkUpdateManyWithoutModelNestedInput.prototype, "delete", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereUniqueInput_1.ChunkWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkUpdateManyWithoutModelNestedInput.prototype, "connect", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkUpdateWithWhereUniqueWithoutModelInput_1.ChunkUpdateWithWhereUniqueWithoutModelInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkUpdateManyWithoutModelNestedInput.prototype, "update", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkUpdateManyWithWhereWithoutModelInput_1.ChunkUpdateManyWithWhereWithoutModelInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkUpdateManyWithoutModelNestedInput.prototype, "updateMany", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkScalarWhereInput_1.ChunkScalarWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkUpdateManyWithoutModelNestedInput.prototype, "deleteMany", void 0);
exports.ChunkUpdateManyWithoutModelNestedInput = ChunkUpdateManyWithoutModelNestedInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkUpdateManyWithoutModelNestedInput", {})
], ChunkUpdateManyWithoutModelNestedInput);
